import { describe, expect, test } from "bun:test";
import { autoAllows, SimTransport } from "./engine";
import type { AgentEvent, TaskSpec } from "./protocol";

const TASK: TaskSpec = {
  id: "test-task",
  title: "Test the tester",
  repo: "grok-build",
  estOutputTokens: 800,
  plan: ["step one", "step two"],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("autoAllows", () => {
  test("benign tools always run", () => {
    expect(autoAllows(-1, 0)).toBe(true);
    expect(autoAllows(1, 0)).toBe(true);
  });

  test("mutating tools need a non-paranoid operator", () => {
    expect(autoAllows(-1, 1)).toBe(false);
    expect(autoAllows(0, 1)).toBe(true);
  });

  test("spicy tools need yolo", () => {
    expect(autoAllows(0.4, 2)).toBe(false);
    expect(autoAllows(0.8, 2)).toBe(true);
  });
});

describe("SimTransport", () => {
  test("streams a session: start, deltas, todos, usage", async () => {
    const transport = new SimTransport();
    const events: AgentEvent[] = [];
    transport.subscribe((e) => {
      events.push(e);
    });
    transport.setThrottle(1);
    transport.setEffort(1);
    transport.setRisk(1); // yolo: nothing blocks, session flows
    transport.load(TASK);
    expect(transport.status).toBe("idle");

    transport.play();
    expect(transport.status).toBe("running");
    await sleep(1500);
    transport.pause();
    expect(transport.status).toBe("paused");

    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has("session_started")).toBe(true);
    expect(kinds.has("todos_updated")).toBe(true);
    expect(kinds.has("usage_updated")).toBe(true);
    expect(
      events.some((e) => e.kind === "thinking_delta" || e.kind === "text_delta"),
    ).toBe(true);
    expect(transport.progress()).toBeGreaterThan(0);
  });

  test("paranoid risk parks the run on a blocking permission", async () => {
    const transport = new SimTransport();
    const events: AgentEvent[] = [];
    transport.subscribe((e) => {
      events.push(e);
    });
    transport.setThrottle(1);
    transport.setEffort(1);
    transport.setRisk(-1); // every mutating tool must ask
    transport.load(TASK);
    transport.play();

    // seeded script for this task id includes mutating tools; wait for the block
    let blocked = false;
    for (let i = 0; i < 60 && !blocked; i++) {
      await sleep(100);
      blocked = transport.status === "blocked";
    }
    transport.pause();
    expect(blocked).toBe(true);

    const request = events.find(
      (e): e is Extract<AgentEvent, { kind: "permission_requested" }> =>
        e.kind === "permission_requested" && e.blocking,
    );
    expect(request).toBeDefined();
    if (request !== undefined) {
      transport.play();
      transport.respondPermission(request.requestId, "deny");
      const resolved = events.find(
        (e) => e.kind === "permission_resolved" && e.requestId === request.requestId,
      );
      expect(resolved).toBeDefined();
      expect(transport.status).toBe("running");
      transport.stop();
    }
  });

  test("stop emits an aborted session_finished", () => {
    const transport = new SimTransport();
    const events: AgentEvent[] = [];
    transport.subscribe((e) => {
      events.push(e);
    });
    transport.load(TASK);
    transport.play();
    transport.stop();
    const finished = events.find(
      (e): e is Extract<AgentEvent, { kind: "session_finished" }> =>
        e.kind === "session_finished",
    );
    expect(finished?.result).toBe("aborted");
    expect(transport.status).toBe("idle");
  });
});

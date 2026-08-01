import { playLlamaJingle } from "./jingle";
import { pick } from "./rng";
import {
  appendStream,
  patchSession,
  pushLog,
  sessionStore,
} from "../state/session";
import {
  addTask,
  currentTask,
  isConsumed,
  nextTaskId,
  queueStore,
  setCurrent,
  setTaskStatus,
  statusOf,
} from "../state/queue";
import { applyPreset, settingsStore, TUNER_PRESETS } from "../state/settings";
import { SimTransport } from "./engine";
import type {
  AgentEvent,
  AgentTransport,
  PermissionDecision,
  TaskSpec,
  ToolKind,
} from "./protocol";
import { MCP_SERVER_NAMES, TOOL_TEMPLATES } from "./tasks";

/**
 * The deck. One transport wired into the stores; the tiles only ever call
 * these verbs — swap SimTransport for a real ACP client and the UI is none
 * the wiser. Typed as the boundary interface so nothing here can lean on
 * sim-only surface.
 */
export const transport: AgentTransport = new SimTransport();

/** vis tap for canvases (tiles must not touch the transport directly) */
export function readAnalyserFrame(bands: Float32Array, scope: Float32Array): void {
  transport.analyser.getBands(bands);
  transport.analyser.getScope(scope);
}

const TOOL_GLYPH: Record<ToolKind, string> = {
  terminal: "$",
  file_edit: "±",
  file_read: "≡",
  search: "?",
  web: "@",
  mcp: "⌁",
  subagent: "&",
  task: "•",
};

let booted = false;
let lastClock = 0;
const callTools = new Map<string, ToolKind>();

export function boot(): void {
  if (booted) {
    return;
  }
  booted = true;

  transport.subscribe(onEvent);

  const applyDials = (): void => {
    const s = settingsStore.state;
    transport.setThrottle(s.throttle / 100);
    transport.setRisk(s.risk / 100);
    // tuner OFF pins effort to neutral, like a bypassed EQ
    transport.setEffort((s.tunerOn ? s.effort : 50) / 100);
  };
  applyDials();
  settingsStore.subscribe(applyDials);

  const task = currentTask(queueStore.state);
  if (task !== null) {
    transport.load(task);
    patchSession({ task });
  }

  // session clock + meters
  lastClock = performance.now();
  setInterval(() => {
    const now = performance.now();
    const delta = now - lastClock;
    lastClock = now;
    const status = transport.status;
    if (status === "running" || status === "blocked") {
      sessionStore.setState((s) => ({
        ...s,
        elapsedMs: s.elapsedMs + delta,
        tokPerSec: transport.analyser.tokensPerSecond(),
        progress: transport.progress(),
        status,
      }));
    } else if (sessionStore.state.status !== status) {
      patchSession({ status, tokPerSec: 0 });
    }
  }, 200);

  // MCP weather
  const servers = MCP_SERVER_NAMES.map((name, i) => ({
    name,
    status: "online" as const,
    toolCount: 3 + ((i * 7) % 11),
  }));
  patchSession({ mcp: servers });
  setInterval(() => {
    sessionStore.setState((s) => {
      const roll = Math.random();
      if (roll > 0.25 || s.mcp.length === 0) {
        return s;
      }
      const index = Math.floor(Math.random() * s.mcp.length);
      const mcp = s.mcp.map((server, i) => {
        if (i !== index) {
          return server;
        }
        const next =
          server.status === "online"
            ? roll < 0.06
              ? ("down" as const)
              : ("online" as const)
            : ("online" as const);
        return { ...server, status: next };
      });
      return { ...s, mcp };
    });
  }, 4000);
}

function onEvent(event: AgentEvent): void {
  switch (event.kind) {
    case "session_started": {
      if (settingsStore.state.tunerAuto) {
        let hash = 0;
        for (const ch of event.task.id) {
          hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        }
        const preset = TUNER_PRESETS[hash % TUNER_PRESETS.length];
        if (preset !== undefined) {
          applyPreset(preset);
        }
      }
      patchSession({
        task: event.task,
        status: "running",
        elapsedMs: 0,
        progress: 0,
        pendingPerms: [],
        activeToolLabel: null,
        subagentActive: false,
      });
      pushLog("sys", `▶ session: ${event.task.title}`, "ok");
      break;
    }
    case "thinking_delta":
      appendStream("think", event.text);
      break;
    case "text_delta":
      appendStream("say", event.text);
      break;
    case "tool_call_started": {
      callTools.set(event.callId, event.tool);
      const glyph = TOOL_GLYPH[event.tool];
      pushLog("tool", `${glyph} ${event.label}`);
      patchSession({
        activeToolLabel: event.label,
        ...(event.tool === "subagent" ? { subagentActive: true } : {}),
      });
      break;
    }
    case "tool_call_finished": {
      const tool = callTools.get(event.callId);
      callTools.delete(event.callId);
      pushLog(
        "result",
        `${event.ok ? "✓" : "✗"} ${event.summary}`,
        event.ok ? "ok" : "err",
      );
      patchSession({
        activeToolLabel: null,
        ...(tool === "subagent" ? { subagentActive: false } : {}),
      });
      break;
    }
    case "permission_requested":
      if (event.blocking) {
        sessionStore.setState((s) => ({
          ...s,
          pendingPerms: [
            ...s.pendingPerms,
            {
              requestId: event.requestId,
              tool: event.tool,
              label: event.label,
              risk: event.risk,
            },
          ],
        }));
        pushLog("perm", `⚿ approval needed: ${event.label}`, "warn");
      }
      break;
    case "permission_resolved":
      sessionStore.setState((s) => ({
        ...s,
        pendingPerms: s.pendingPerms.filter((p) => p.requestId !== event.requestId),
      }));
      if (event.auto) {
        pushLog("perm", `⚿ auto-allowed by policy`);
      } else {
        pushLog(
          "perm",
          `⚿ ${event.decision === "allow" ? "allowed" : "DENIED"} by operator`,
          event.decision === "allow" ? "ok" : "err",
        );
      }
      break;
    case "todos_updated":
      patchSession({ todos: event.todos });
      break;
    case "usage_updated":
      patchSession({ usage: event.usage });
      break;
    case "session_finished": {
      const finishedId = queueStore.state.currentId;
      if (finishedId !== null && statusOf(queueStore.state, finishedId) === "running") {
        setTaskStatus(
          finishedId,
          event.result === "success" ? "done" : event.result === "aborted" ? "stopped" : "failed",
        );
      }
      pushLog(
        "sys",
        `■ ${event.result === "success" ? "finished" : event.result}: ${event.summary}`,
        event.result === "success" ? "ok" : "warn",
      );
      patchSession({ status: transport.status, pendingPerms: [], activeToolLabel: null });
      if (event.result === "success") {
        window.setTimeout(() => {
          advance(1, true);
        }, 1400);
      }
      break;
    }
  }
}

/** the ▶ button: start or resume, never pause (winamp X semantics) */
export function play(): void {
  const status = transport.status;
  if (status === "running" || status === "blocked") {
    return;
  }
  if (status === "paused") {
    transport.play();
    pushLog("sys", "▶ resumed");
    return;
  }
  const task = currentTask(queueStore.state);
  if (task === null) {
    pushLog("sys", "queue is empty — hit ADD in the queue window", "warn");
    return;
  }
  if (isConsumed(queueStore.state, task.id)) {
    // a started session can never be restarted; roll forward instead
    const next = nextTaskId(queueStore.state, 1);
    if (next === null) {
      pushLog("sys", "every queued task has already run — ADD a new one", "warn");
      return;
    }
    jumpTo(next, true);
    return;
  }
  startTask(task);
}

/** the single place a task transitions queued → running */
function startTask(task: TaskSpec): void {
  setTaskStatus(task.id, "running");
  transport.load(task);
  patchSession({ task });
  transport.play();
}

/** the ⏸ button: pause/resume toggle, no-op when stopped (winamp C semantics) */
export function pauseToggle(): void {
  const status = transport.status;
  if (status === "running" || status === "blocked") {
    transport.pause();
    pushLog("sys", "⏸ paused");
    return;
  }
  if (status === "paused") {
    transport.play();
    pushLog("sys", "▶ resumed");
  }
}

export function stop(): void {
  const current = queueStore.state.currentId;
  if (current !== null && statusOf(queueStore.state, current) === "running") {
    setTaskStatus(current, "stopped"); // consumed: aborting doesn't rewind it
  }
  transport.stop();
  patchSession({ elapsedMs: 0, progress: 0, tokPerSec: 0, pendingPerms: [] });
}

export function advance(direction: 1 | -1, autoplay: boolean): void {
  const id = nextTaskId(queueStore.state, direction);
  if (id === null) {
    pushLog("sys", "end of queue", "plain");
    patchSession({ status: transport.status });
    return;
  }
  jumpTo(id, autoplay || transport.status === "running" || transport.status === "blocked");
}

export function jumpTo(id: string, autoplay: boolean): void {
  const task = queueStore.state.items.find((t) => t.id === id);
  if (task === undefined) {
    return;
  }
  if (isConsumed(queueStore.state, id)) {
    const status = statusOf(queueStore.state, id);
    pushLog(
      "sys",
      status === "running"
        ? "that session is already running"
        : `already ran (${status}) — sessions don't restart; ADD a new task`,
      "warn",
    );
    return;
  }
  setCurrent(id);
  transport.stop();
  patchSession({ task, elapsedMs: 0, progress: 0 });
  if (autoplay) {
    startTask(task);
  } else {
    transport.load(task);
  }
}

export function respondPermission(requestId: string, decision: PermissionDecision): void {
  transport.respondPermission(requestId, decision);
}

let addCounter = 0;

export interface TaskDraft {
  readonly repo: string;
  readonly prompt: string;
  readonly effort: string;
}

/** queue a task the operator actually composed */
export function queueTask(draft: TaskDraft): TaskSpec {
  addCounter += 1;
  const prompt = draft.prompt.trim();
  const firstLine = prompt.split("\n")[0] ?? prompt;
  const commands = [...prompt.matchAll(/(?:^|\n)\/([\w:-]+)/g)].map((m) => `/${m[1] ?? ""}`);
  const task: TaskSpec = {
    id: `t-user-${addCounter}-${Date.now().toString(36)}`,
    title: firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine,
    repo: draft.repo,
    estOutputTokens: 3_000 + Math.min(40_000, prompt.length * 40),
    plan:
      commands.length > 0
        ? [`Run ${commands.join(" ")}`, "Carry out the request", "Report back"]
        : ["Understand the ask", "Do the thing", "Prove it works"],
  };
  addTask(task);
  pushLog(
    "sys",
    `+ queued [${draft.repo}] ${task.title}${
      draft.effort !== "medium" ? ` (effort: ${draft.effort})` : ""
    }`,
  );
  return task;
}

/** the eject button / L key: a quick throwaway task, no dialog */
export function addRandomTask(): void {
  const template = pick(Math.random, TOOL_TEMPLATES);
  queueTask({
    repo: "grok-build-app",
    prompt: `Operator request: ${template.label}`,
    effort: "medium",
  });
}

export function whipTheLlama(): void {
  patchSession({ llamaUntil: Date.now() + 9000 });
  playLlamaJingle();
  pushLog("sys", "🦙 IT REALLY WHIPS THE LLAMA'S ASS — respect to 1997", "ok");
}

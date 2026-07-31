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
  nextTaskId,
  queueStore,
  setCurrent,
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
  setCurrent(id);
  transport.stop();
  transport.load(task);
  patchSession({ task, elapsedMs: 0, progress: 0 });
  if (autoplay) {
    transport.play();
  }
}

export function respondPermission(requestId: string, decision: PermissionDecision): void {
  transport.respondPermission(requestId, decision);
}

let addCounter = 0;

export function addRandomTask(): void {
  addCounter += 1;
  const template = pick(Math.random, TOOL_TEMPLATES);
  const task: TaskSpec = {
    id: `t-user-${addCounter}-${Date.now().toString(36)}`,
    title: `Operator request: ${template.label}`,
    repo: "grok-build",
    estOutputTokens: 4_000 + Math.floor(Math.random() * 18_000),
    plan: ["Understand the ask", "Do the thing", "Prove it works"],
  };
  addTask(task);
  pushLog("sys", `+ queued: ${task.title}`);
}

export function whipTheLlama(): void {
  patchSession({ llamaUntil: Date.now() + 9000 });
  playLlamaJingle();
  pushLog("sys", "🦙 IT REALLY WHIPS THE LLAMA'S ASS — respect to 1997", "ok");
}

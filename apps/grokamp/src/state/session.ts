import { Store } from "@tanstack/store";
import type {
  McpServer,
  RiskLevel,
  TaskSpec,
  TodoItem,
  TokenUsage,
  ToolKind,
  TransportStatus,
} from "../agent/protocol";

export interface LogLine {
  readonly id: number;
  readonly kind: "sys" | "think" | "say" | "tool" | "result" | "perm";
  readonly text: string;
  readonly tone: "plain" | "ok" | "warn" | "err";
}

export interface PendingPermission {
  readonly requestId: string;
  readonly tool: ToolKind;
  readonly label: string;
  readonly risk: RiskLevel;
}

export interface SessionState {
  readonly status: TransportStatus;
  readonly task: TaskSpec | null;
  readonly elapsedMs: number;
  readonly usage: TokenUsage;
  readonly tokPerSec: number;
  readonly progress: number;
  readonly log: readonly LogLine[];
  readonly todos: readonly TodoItem[];
  readonly mcp: readonly McpServer[];
  readonly pendingPerms: readonly PendingPermission[];
  readonly activeToolLabel: string | null;
  readonly subagentActive: boolean;
  readonly llamaUntil: number;
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  contextUsed: 0,
  contextLimit: 256_000,
  costUsd: 0,
};

const INITIAL: SessionState = {
  status: "idle",
  task: null,
  elapsedMs: 0,
  usage: EMPTY_USAGE,
  tokPerSec: 0,
  progress: 0,
  log: [
    {
      id: 0,
      kind: "sys",
      text: "GROKAMP 0.1 — winamp-grade frontend for grok-build. press ▶ to run the demo agent.",
      tone: "plain",
    },
  ],
  todos: [],
  mcp: [],
  pendingPerms: [],
  activeToolLabel: null,
  subagentActive: false,
  llamaUntil: 0,
};

export const sessionStore = new Store<SessionState>(INITIAL);

const MAX_LOG = 500;
let logId = 1;

export function pushLog(
  kind: LogLine["kind"],
  text: string,
  tone: LogLine["tone"] = "plain",
): void {
  sessionStore.setState((s) => {
    const line: LogLine = { id: logId++, kind, text, tone };
    const log = s.log.length >= MAX_LOG ? [...s.log.slice(-MAX_LOG + 1), line] : [...s.log, line];
    return { ...s, log };
  });
}

/** stream deltas coalesce into the trailing line until it gets long */
export function appendStream(kind: "think" | "say", text: string): void {
  sessionStore.setState((s) => {
    const last = s.log[s.log.length - 1];
    if (last !== undefined && last.kind === kind && last.text.length < 220) {
      const merged: LogLine = { ...last, text: last.text + text };
      return { ...s, log: [...s.log.slice(0, -1), merged] };
    }
    const line: LogLine = { id: logId++, kind, text: text.trimStart(), tone: "plain" };
    const log = s.log.length >= MAX_LOG ? [...s.log.slice(-MAX_LOG + 1), line] : [...s.log, line];
    return { ...s, log };
  });
}

export function patchSession(patch: Partial<SessionState>): void {
  sessionStore.setState((s) => ({ ...s, ...patch }));
}

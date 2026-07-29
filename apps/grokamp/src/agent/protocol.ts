/**
 * The event vocabulary a Grokamp frontend consumes.
 *
 * Shaped after the seams grok-build already exposes (ACP / headless stdio
 * streaming): session lifecycle, streamed deltas, tool call begin/end,
 * permission round-trips, usage. The bundled SimTransport speaks this
 * protocol; a real adapter would translate grok-build's ACP messages into it.
 */

export type ToolKind =
  | "terminal"
  | "file_edit"
  | "file_read"
  | "search"
  | "web"
  | "mcp"
  | "subagent"
  | "task";

export type SessionResult = "success" | "error" | "aborted";

export type PermissionDecision = "allow" | "deny";

/** 0 = benign, 1 = mutating, 2 = spicy (network, deletes, prod) */
export type RiskLevel = 0 | 1 | 2;

export interface TodoItem {
  readonly id: string;
  readonly text: string;
  readonly status: "pending" | "in_progress" | "completed";
}

export interface McpServer {
  readonly name: string;
  readonly status: "online" | "connecting" | "down";
  readonly toolCount: number;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly contextUsed: number;
  readonly contextLimit: number;
  readonly costUsd: number;
}

export interface TaskSpec {
  readonly id: string;
  readonly title: string;
  readonly repo: string;
  /** rough size, drives the position bar like track length drove Winamp's */
  readonly estOutputTokens: number;
  readonly plan: readonly string[];
}

export type AgentEvent =
  | { readonly kind: "session_started"; readonly task: TaskSpec }
  | { readonly kind: "thinking_delta"; readonly text: string }
  | { readonly kind: "text_delta"; readonly text: string }
  | {
      readonly kind: "tool_call_started";
      readonly callId: string;
      readonly tool: ToolKind;
      readonly label: string;
    }
  | {
      readonly kind: "tool_call_finished";
      readonly callId: string;
      readonly ok: boolean;
      readonly summary: string;
    }
  | {
      readonly kind: "permission_requested";
      readonly requestId: string;
      readonly tool: ToolKind;
      readonly label: string;
      readonly risk: RiskLevel;
      /** false = policy will auto-resolve it; true = the run is parked on you */
      readonly blocking: boolean;
    }
  | {
      readonly kind: "permission_resolved";
      readonly requestId: string;
      readonly decision: PermissionDecision;
      readonly auto: boolean;
    }
  | { readonly kind: "todos_updated"; readonly todos: readonly TodoItem[] }
  | { readonly kind: "usage_updated"; readonly usage: TokenUsage }
  | {
      readonly kind: "session_finished";
      readonly result: SessionResult;
      readonly summary: string;
    };

export type TransportStatus = "idle" | "running" | "blocked" | "paused" | "done";

/** the visualizer feed every transport must supply (winamp's PCM tap) */
export interface AgentVis {
  /** copy current spectrum bands (0..1) into `target` */
  getBands(target: Float32Array): void;
  /** copy current oscilloscope samples (-1..1) into `target` */
  getScope(target: Float32Array): void;
  tokensPerSecond(): number;
}

/**
 * What a playable agent backend looks like to the UI. Winamp mapping:
 * load/play/pause/stop are the transport buttons, throttle is the volume
 * slider, risk is the balance slider, effort is the EQ preamp. Everything
 * the tiles consume is on this boundary — a real grok-build ACP adapter
 * must be a drop-in replacement for the demo SimTransport.
 */
export interface AgentTransport {
  load(task: TaskSpec): void;
  play(): void;
  pause(): void;
  stop(): void;
  respondPermission(requestId: string, decision: PermissionDecision): void;
  /** 0..1 — simulated output speed */
  setThrottle(value: number): void;
  /** -1..1 — paranoid..yolo; gates which permissions auto-allow */
  setRisk(value: number): void;
  /** 0..1 — reasoning effort; more thinking, more tokens */
  setEffort(value: number): void;
  subscribe(listener: (event: AgentEvent) => void): () => void;
  /** 0..1 — estimated progress through the loaded task (the posbar) */
  progress(): number;
  readonly analyser: AgentVis;
  readonly status: TransportStatus;
}

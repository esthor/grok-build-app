// The wire protocol shared by the Bun server and the browser deck.
// Everything the widgets render flows through these types, whether it came
// from a live collector or the demo generator.

/** Agent phases as reported by grok's events.jsonl `phase_changed`. */
export type AgentPhase =
  | "idle"
  | "waiting_for_model"
  | "streaming_reasoning"
  | "streaming_text"
  | "tool_execution"
  | "permission_prompt";

export type ToolStats = {
  count: number;
  failures: number;
  totalMs: number;
};

export type AgentSnapshot = {
  id: string;
  title: string;
  cwd: string;
  model: string;
  agentName: string;
  reasoningEffort: string;
  sandbox: string;
  live: boolean;
  startedAt: number;
  updatedAt: number;
  phase: AgentPhase;
  turnCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCallCount: number;
  toolFailureCount: number;
  errorCount: number;
  compactionCount: number;
  durationSec: number;
  /** Context window occupancy. */
  contextUsedTokens: number;
  contextWindowTokens: number;
  /** Cumulative tokens observed on the update stream. */
  totalTokens: number;
  /** Latency profile (milliseconds). */
  ttftAvgMs: number;
  ttftMinMs: number;
  ttftMaxMs: number;
  itlP50Ms: number;
  itlP99Ms: number;
  /** Agent-authored line churn. */
  linesAdded: number;
  linesRemoved: number;
  filesTouched: number;
  gitBranch: string;
  gitCommit: string;
  /** Per-tool aggregates, keyed by tool name (read_file, grep, ...). */
  tools: Record<string, ToolStats>;
  permsRequested: number;
  permsDenied: number;
  permAvgWaitMs: number;
  permPending: boolean;
};

export type FeedKind =
  | "turn"
  | "phase"
  | "tool_start"
  | "tool_end"
  | "perm_req"
  | "perm_res"
  | "thought"
  | "message"
  | "user"
  | "edit"
  | "mcp"
  | "error";

export type FeedItem = {
  at: number;
  kind: FeedKind;
  text: string;
  tool?: string;
  ok?: boolean;
  ms?: number;
};

export type CpuStats = {
  totalPct: number;
  cores: number[];
  load1: number;
  load5: number;
  load15: number;
};

export type MemStats = {
  usedBytes: number;
  totalBytes: number;
  wiredBytes: number;
  compressedBytes: number;
};

export type NetStats = {
  iface: string;
  rxBps: number;
  txBps: number;
  rxTotal: number;
  txTotal: number;
};

export type DiskStats = {
  path: string;
  usedBytes: number;
  totalBytes: number;
};

export type ProcStat = {
  pid: number;
  name: string;
  cpuPct: number;
  memPct: number;
};

export type SysStats = {
  at: number;
  hostname: string;
  os: string;
  uptimeSec: number;
  cpu: CpuStats;
  mem: MemStats;
  net: NetStats;
  disk: DiskStats;
  procs: ProcStat[];
};

export type MediaState = {
  player: string;
  state: "playing" | "paused";
  track: string;
  artist: string;
  album: string;
  positionSec: number;
  durationSec: number;
};

export type ServerInfo = {
  name: string;
  version: string;
  mode: "live" | "demo";
  startedAt: number;
};

/** Server → client messages. */
export type Wire =
  | { t: "hello"; server: ServerInfo }
  | { t: "sys"; sys: SysStats }
  | { t: "agent"; agent: AgentSnapshot | null }
  | { t: "feed"; items: FeedItem[] }
  | { t: "media"; media: MediaState | null };

export function encodeWire(msg: Wire): string {
  return JSON.stringify(msg);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate a frame's discriminator and the shape of its payload slot before
 * trusting it. Field-level validation stays with the consumers (widgets
 * already treat numerics defensively); this boundary guarantees the payload
 * key exists with the right container type so `msg.sys`-style access can't
 * explode on a malformed frame.
 */
export function decodeWire(raw: string): Wire | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed)) return null;
    switch (parsed["t"]) {
      case "hello":
        return isObj(parsed["server"]) ? (parsed as Wire) : null;
      case "sys":
        return isObj(parsed["sys"]) ? (parsed as Wire) : null;
      case "agent":
        return isObj(parsed["agent"]) || parsed["agent"] === null ? (parsed as Wire) : null;
      case "media":
        return isObj(parsed["media"]) || parsed["media"] === null ? (parsed as Wire) : null;
      case "feed":
        return Array.isArray(parsed["items"]) && parsed["items"].every(isObj)
          ? (parsed as Wire)
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

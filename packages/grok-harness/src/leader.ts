// The grok leader IPC surface — push updates and control (grokamp transport).
// Transport: Unix domain socket at $GROK_HOME/leader.sock (override:
// $GROK_LEADER_SOCKET). Framing: u32 BIG-ENDIAN length prefix + JSON body,
// max 64 MiB. Mirrors xai-grok-shell/src/leader/protocol.rs.
//
// Handshake: Register → wait for registered (and leader_ready when ready:false)
// before any ACP traffic.
//
// Roster notifications may arrive as x.ai/sessions/changed OR
// _x.ai/sessions/changed — use methodsEqual from methods.ts.

declare class TextEncoder {
  encode(input: string): Uint8Array;
}
declare class TextDecoder {
  decode(input: Uint8Array): string;
}

export const LEADER_PROTOCOL_VERSION = 1;
export const LEADER_MAX_MESSAGE_SIZE = 64 * 1024 * 1024;
export const LEADER_SOCKET_ENV = "GROK_LEADER_SOCKET";

export type ClientMode = "headless" | "stdio";

export type ClientCapabilities = {
  yolo_mode?: boolean;
  auto_mode?: boolean;
  default_model?: string;
  client_version?: string;
  terminal?: boolean;
  fs_read?: boolean;
  fs_write?: boolean;
  /** Code-navigation advertisement (injected into session/new meta). */
  code_nav_enabled?: boolean;
};

export type LeaderCapabilities = {
  control_v1?: boolean;
  runtime_cpu_profile?: boolean;
  profile_formats?: string[];
  workspace_exposure?: boolean;
  relaunch_v1?: boolean;
};

export type LeaderClientMessage =
  | {
      type: "register";
      client_type: string;
      mode: ClientMode;
      capabilities: ClientCapabilities;
    }
  | { type: "acp"; payload: string }
  | { type: "control"; request_id: string; command: ControlCommand }
  | { type: "ping" }
  | { type: "disconnect" };

export type ShutdownReason = "auto_update" | "idle_timeout" | "manual" | string;

export type LeaderServerMessage =
  | {
      type: "registered";
      client_id: number;
      ready: boolean;
      leader_protocol_version?: number;
      leader_binary_version?: string;
      leader_capabilities?: LeaderCapabilities;
    }
  | { type: "acp"; payload: string }
  | { type: "control_result"; request_id: string; result: unknown }
  | { type: "pong" }
  | { type: "error"; code: number; message: string }
  | { type: "shutting_down"; reason: ShutdownReason; delay_ms: number }
  | { type: "shutdown" }
  | { type: "leader_ready" };

/** Control commands (tag=type, snake_case). */
export type ControlCommand =
  | { type: "get_leader_info" }
  | { type: "cpu_profile_status" }
  | { type: "start_cpu_profile"; output?: string; frequency_hz?: number }
  | { type: "stop_cpu_profile" }
  | { type: "workspace_start"; hub_url?: string; cwd: string }
  | { type: "workspace_pause" }
  | { type: "workspace_resume" }
  | { type: "workspace_stop" }
  | { type: "workspace_status" }
  | { type: "relaunch_for_update"; to_version: string };

export const SESSIONS_LIST_METHOD = "x.ai/sessions/list";
export const SESSIONS_CHANGED_METHOD = "x.ai/sessions/changed";
export const SESSION_USAGE_METHOD = "x.ai/session/usage";
export const SESSION_INFO_METHOD = "x.ai/session/info";
export const SESSION_UPDATES_METHOD = "x.ai/session/updates";

export type RosterActivity =
  | "working"
  | "idle"
  | "needs_input"
  | "dormant"
  | "completed"
  | "dead";

export type RosterEntry = {
  sessionId: string;
  title?: string;
  cwd: string;
  isWorktree: boolean;
  modelId?: string;
  /** Per-session reasoning effort for modelId. */
  reasoningEffort?: string;
  yolo: boolean;
  activity: RosterActivity;
  resident: boolean;
  lastChangeUnixMs: number;
  origin: { kind: "local" } | { kind: "remote"; host: string };
};

export type RosterChanged = {
  upserted: RosterEntry[];
  removed: string[];
};

export type RosterListResponse = {
  sessions: RosterEntry[];
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Best-effort parse of a roster entry from wire JSON. */
export function parseRosterEntry(v: unknown): RosterEntry | null {
  if (!isObj(v)) return null;
  const sessionId = typeof v["sessionId"] === "string" ? v["sessionId"] : "";
  const cwd = typeof v["cwd"] === "string" ? v["cwd"] : "";
  if (sessionId === "" || cwd === "") return null;
  const originRaw = v["origin"];
  let origin: RosterEntry["origin"] = { kind: "local" };
  if (isObj(originRaw) && originRaw["kind"] === "remote" && typeof originRaw["host"] === "string") {
    origin = { kind: "remote", host: originRaw["host"] };
  }
  const entry: RosterEntry = {
    sessionId,
    cwd,
    isWorktree: v["isWorktree"] === true,
    yolo: v["yolo"] === true,
    activity: (typeof v["activity"] === "string" ? v["activity"] : "idle") as RosterActivity,
    resident: v["resident"] === true,
    lastChangeUnixMs: typeof v["lastChangeUnixMs"] === "number" ? v["lastChangeUnixMs"] : 0,
    origin,
  };
  if (typeof v["title"] === "string") entry.title = v["title"];
  if (typeof v["modelId"] === "string") entry.modelId = v["modelId"];
  if (typeof v["reasoningEffort"] === "string") entry.reasoningEffort = v["reasoningEffort"];
  return entry;
}

export function parseRosterChanged(params: unknown): RosterChanged | null {
  if (!isObj(params)) return null;
  const upserted: RosterEntry[] = [];
  if (Array.isArray(params["upserted"])) {
    for (const item of params["upserted"]) {
      const e = parseRosterEntry(item);
      if (e) upserted.push(e);
    }
  }
  const removed: string[] = [];
  if (Array.isArray(params["removed"])) {
    for (const id of params["removed"]) {
      if (typeof id === "string") removed.push(id);
    }
  }
  return { upserted, removed };
}

export function parseRosterList(result: unknown): RosterEntry[] {
  if (!isObj(result) || !Array.isArray(result["sessions"])) return [];
  const out: RosterEntry[] = [];
  for (const item of result["sessions"]) {
    const e = parseRosterEntry(item);
    if (e) out.push(e);
  }
  return out;
}

/** Frame one leader message for the wire (u32 BE length + JSON). */
export function frameLeaderMessage(msg: LeaderClientMessage): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(msg));
  if (body.length > LEADER_MAX_MESSAGE_SIZE) {
    throw new Error(`leader message ${body.length} exceeds max ${LEADER_MAX_MESSAGE_SIZE}`);
  }
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, false);
  out.set(body, 4);
  return out;
}

/** Incremental deframer: feed received chunks, get parsed server messages. */
export class LeaderDeframer {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): LeaderServerMessage[] {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf, 0);
    joined.set(chunk, this.buf.length);
    this.buf = joined;

    const out: LeaderServerMessage[] = [];
    while (this.buf.length >= 4) {
      const len = new DataView(this.buf.buffer, this.buf.byteOffset).getUint32(0, false);
      if (len > LEADER_MAX_MESSAGE_SIZE) {
        this.buf = new Uint8Array(0);
        break;
      }
      if (this.buf.length < 4 + len) break;
      const body = this.buf.slice(4, 4 + len);
      this.buf = this.buf.slice(4 + len);
      try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
        if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
          out.push(parsed as LeaderServerMessage);
        }
      } catch {
        // Skip unparseable frame.
      }
    }
    return out;
  }
}

// The grok leader IPC surface — for apps that want PUSH updates and control
// (grokamp's real-transport seam) instead of tailing files.
//
// Transport: Unix domain socket at $GROK_HOME/leader.sock (override:
// $GROK_LEADER_SOCKET). Framing: u32 BIG-ENDIAN length prefix + JSON body,
// max 64 MiB. Mirrors xai-grok-shell/src/leader/protocol.rs.
//
// Handshake: send Register with ready:false semantics in mind — wait for
// `registered` and then `leader_ready` before any ACP traffic.

// The package compiles against lib:ESNext only (no DOM/Node/Bun types), but
// TextEncoder/TextDecoder are present in every target runtime (Bun, Node,
// browsers, Tauri webview). Declare the minimal surface we use.
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
declare class TextDecoder {
  decode(input: Uint8Array): string;
}

export const LEADER_PROTOCOL_VERSION = 1;
export const LEADER_MAX_MESSAGE_SIZE = 64 * 1024 * 1024;
export const LEADER_SOCKET_ENV = "GROK_LEADER_SOCKET";

export type LeaderClientMessage =
  | {
      type: "register";
      client_type: string;
      mode: "headless" | "stdio";
      capabilities: {
        yolo_mode?: boolean;
        auto_mode?: boolean;
        default_model?: string;
        client_version?: string;
        terminal?: boolean;
        fs_read?: boolean;
        fs_write?: boolean;
      };
    }
  | { type: "acp"; payload: string }
  | { type: "control"; request_id: string; command: unknown }
  | { type: "ping" }
  | { type: "disconnect" };

export type LeaderServerMessage =
  | {
      type: "registered";
      client_id: number;
      ready: boolean;
      leader_protocol_version?: number;
      leader_binary_version?: string;
    }
  | { type: "acp"; payload: string }
  | { type: "control_result"; request_id: string; result: unknown }
  | { type: "pong" }
  | { type: "error"; code: number; message: string }
  | { type: "shutting_down"; reason: string; delay_ms: number }
  | { type: "shutdown" }
  | { type: "leader_ready" };

// ── Multi-session roster (the fleet-view feed) ───────────────────────────
// Request/response `x.ai/sessions/list` → { sessions: RosterEntry[] }
// Broadcast `x.ai/sessions/changed` → { upserted: [...], removed: [ids] }

export const SESSIONS_LIST_METHOD = "x.ai/sessions/list";
export const SESSIONS_CHANGED_METHOD = "x.ai/sessions/changed";
export const SESSION_USAGE_METHOD = "x.ai/session/usage";
export const SESSION_INFO_METHOD = "x.ai/session/info";
export const SESSION_UPDATES_METHOD = "x.ai/session/updates";

export type RosterActivity = "working" | "idle" | "needs_input" | "dormant" | "completed" | "dead";

export type RosterEntry = {
  sessionId: string;
  title?: string;
  cwd: string;
  isWorktree: boolean;
  modelId?: string;
  yolo: boolean;
  activity: RosterActivity;
  /** true = live actor in this leader; false = read from disk */
  resident: boolean;
  lastChangeUnixMs: number;
  origin: { kind: "local" } | { kind: "remote"; host: string };
};

export type RosterChanged = {
  upserted: RosterEntry[];
  removed: string[];
};

/** Frame one leader message for the wire (u32 BE length + JSON). */
export function frameLeaderMessage(msg: LeaderClientMessage): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(msg));
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
        // Corrupt stream; drop everything rather than allocate unbounded.
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
        // Skip unparseable frame, keep the stream.
      }
    }
    return out;
  }
}

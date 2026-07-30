// Schema for a session's events.jsonl — grok's structured telemetry log.
// Mirrors crates/codegen/xai-file-utils/src/events/types.rs (Serialize-only
// upstream; this is the out-of-tree deserializer). One JSON object per line:
// `{"ts": "<RFC3339 ms UTC>", "type": "<snake_case>", ...fields}`.
//
// Volume note: `phase_changed` is ~90%+ of lines on a busy session — filter
// or debounce before feeding a UI.

import { num, parseObj, str, bool } from "./json.ts";

export const EVENT_SCHEMA_VERSION = "1.0";

export const PHASES = [
  "waiting_for_model",
  "streaming_text",
  "streaming_reasoning",
  "tool_execution",
  "permission_prompt",
] as const;
export type Phase = (typeof PHASES)[number];

export type ToolOutcome =
  | "success"
  | "error"
  | "permission_rejected"
  | "permission_cancelled"
  | "followup"
  | "hook_denied"
  | "invalid_tool"
  | "cancelled";

export type PermissionDecision = "allow" | "deny" | "cancelled" | "followup";
export type TurnOutcome = "completed" | "cancelled" | "error";
export type SessionRelationship = "primary" | "subagent";

export type GrokEvent =
  | {
      type: "turn_started";
      at: number;
      sessionId: string;
      turnNumber: number;
      modelId: string;
      yoloMode: boolean;
      conversationMessageCount: number;
      sessionRelationship: SessionRelationship;
      schemaVersion: string;
    }
  | { type: "turn_ended"; at: number; outcome: TurnOutcome; cancellationCategory: string | null }
  | { type: "phase_changed"; at: number; phase: Phase }
  | { type: "first_token"; at: number }
  | { type: "loop_started"; at: number; loopIndex: number }
  | { type: "tool_started"; at: number; toolName: string }
  | { type: "tool_completed"; at: number; toolName: string; durationMs: number; outcome: ToolOutcome }
  | { type: "permission_requested"; at: number; toolName: string }
  | { type: "permission_resolved"; at: number; toolName: string; decision: PermissionDecision; waitMs: number }
  | { type: "yolo_toggled"; at: number; enabled: boolean }
  | { type: "interjected"; at: number; source: string }
  | { type: "mcp"; at: number; subtype: string; serverName: string | null; healthy: boolean | null }
  | { type: "other"; at: number; subtype: string };

const KNOWN_PHASES: readonly string[] = PHASES;

export function asPhase(v: string): Phase | null {
  return KNOWN_PHASES.includes(v) ? (v as Phase) : null;
}

/**
 * Parse one events.jsonl line. Unknown event types map to `{type: "other"}`
 * (the upstream vocabulary is ~60 variants and grows; goal/laziness/todo-gate
 * orchestration events land there today). Returns null for unparseable lines
 * — skip and continue, per the torn-line contract.
 */
export function parseEventLine(line: string): GrokEvent | null {
  const o = parseObj(line);
  if (o === null) return null;
  const type = str(o["type"]);
  if (type === "") return null;
  const at = Date.parse(str(o["ts"]));
  const ts = Number.isFinite(at) ? at : Date.now();

  switch (type) {
    case "turn_started":
      return {
        type,
        at: ts,
        sessionId: str(o["session_id"]),
        turnNumber: num(o["turn_number"]),
        modelId: str(o["model_id"]),
        yoloMode: bool(o["yolo_mode"]),
        conversationMessageCount: num(o["conversation_message_count"]),
        sessionRelationship: str(o["session_relationship"]) === "subagent" ? "subagent" : "primary",
        schemaVersion: str(o["schema_version"], EVENT_SCHEMA_VERSION),
      };
    case "turn_ended": {
      const outcome = str(o["outcome"], "completed");
      return {
        type,
        at: ts,
        outcome: outcome === "cancelled" || outcome === "error" ? outcome : "completed",
        cancellationCategory: typeof o["cancellation_category"] === "string" ? o["cancellation_category"] : null,
      };
    }
    case "phase_changed": {
      const phase = asPhase(str(o["phase"]));
      return phase === null ? { type: "other", at: ts, subtype: "phase_changed" } : { type, at: ts, phase };
    }
    case "first_token":
      return { type, at: ts };
    case "loop_started":
      return { type, at: ts, loopIndex: num(o["loop_index"]) };
    case "tool_started":
      return { type, at: ts, toolName: str(o["tool_name"], "?") };
    case "tool_completed":
      return {
        type,
        at: ts,
        toolName: str(o["tool_name"], "?"),
        durationMs: num(o["duration_ms"]),
        outcome: str(o["outcome"], "success") as ToolOutcome,
      };
    case "permission_requested":
      return { type, at: ts, toolName: str(o["tool_name"], "?") };
    case "permission_resolved":
      return {
        type,
        at: ts,
        toolName: str(o["tool_name"], "?"),
        decision: str(o["decision"], "allow") as PermissionDecision,
        waitMs: num(o["wait_ms"]),
      };
    case "yolo_toggled":
      return { type, at: ts, enabled: bool(o["enabled"]) };
    case "interjected":
      return { type, at: ts, source: str(o["source"]) };
    default:
      if (type.startsWith("mcp_")) {
        return {
          type: "mcp",
          at: ts,
          subtype: type,
          serverName: typeof o["server_name"] === "string" ? o["server_name"] : null,
          healthy: typeof o["healthy"] === "boolean" ? o["healthy"] : null,
        };
      }
      return { type: "other", at: ts, subtype: type };
  }
}

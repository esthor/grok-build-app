// Schema for a session's events.jsonl — grok's structured telemetry log.
// Complete vocabulary mirrored from crates/codegen/xai-file-utils/src/events/types.rs
// (Serialize-only upstream; this is the out-of-tree deserializer).
// One JSON object per line: {"ts":"<RFC3339 ms UTC>","type":"<snake_case>",...}.
//
// Volume note: phase_changed is ~90%+ of lines on a busy session — debounce UIs.
// Unknown future types land as {type:"other", subtype, fields} (never throw).

import { num, parseObj, str, bool, type JObj } from "./json.ts";

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

export const TOOL_OUTCOMES: readonly ToolOutcome[] = [
  "success",
  "error",
  "permission_rejected",
  "permission_cancelled",
  "followup",
  "hook_denied",
  "invalid_tool",
  "cancelled",
];

export type PermissionDecision = "allow" | "deny" | "cancelled" | "followup";
export const PERMISSION_DECISIONS: readonly PermissionDecision[] = [
  "allow",
  "deny",
  "cancelled",
  "followup",
];

export type TurnOutcome = "completed" | "cancelled" | "error";
export const TURN_OUTCOMES: readonly TurnOutcome[] = ["completed", "cancelled", "error"];

export type SessionRelationship = "primary" | "subagent";

export const CANCELLATION_CATEGORIES = [
  "hook_denied",
  "permission_rejected",
  "permission_cancelled",
  "mid_turn_abort",
] as const;
export type CancellationCategory = (typeof CANCELLATION_CATEGORIES)[number];

export const REDIRECT_KINDS = ["interjection", "cancel_then_send", "queued_after_cancel"] as const;
export type RedirectKind = (typeof REDIRECT_KINDS)[number];

export const INTERJECTION_SOURCES = ["direct", "queue"] as const;
export type InterjectionSource = (typeof INTERJECTION_SOURCES)[number];


/** Every known events.jsonl `type` value (upstream Event enum, snake_case). */
export const KNOWN_EVENT_TYPES = [
  "turn_started",
  "phase_changed",
  "first_token",
  "loop_started",
  "tool_started",
  "tool_completed",
  "permission_requested",
  "permission_resolved",
  "turn_ended",
  "interjected",
  "yolo_toggled",
  "goal_auto_paused",
  "todo_gate_fired",
  "todo_gate_exhausted",
  "laziness_classifier_fired",
  "laziness_nudge_fired",
  "laziness_classifier_aborted",
  "goal_classifier_fired",
  "goal_classifier_verdict",
  "goal_classifier_fail_open",
  "goal_classifier_fail_closed",
  "goal_classifier_cap_reached",
  "goal_classifier_mid_turn_deferred",
  "goal_classifier_dropped_after_cap",
  "goal_classifier_pending_queue_cleared",
  "goal_planner_fired",
  "goal_planner_completed",
  "goal_planner_fail_closed",
  "goal_strategist_fired",
  "goal_strategist_completed",
  "goal_strategist_failed",
  "goal_strategist_contract_restore_failed",
  "goal_summarizer_fired",
  "goal_summarizer_completed",
  "goal_summarizer_fail_open",
  "goal_role_model_resolved",
  "goal_role_model_fail_open",
  "goal_verifier_skeptic_verdict",
  "goal_verifier_aggregate_verdict",
  "goal_premature_stop_detected",
  "mcp_config_resolved",
  "mcp_managed_config_result",
  "mcp_oauth_discovery_timeout",
  "mcp_server_starting",
  "mcp_server_connected",
  "mcp_server_failed",
  "mcp_tool_registration_failed",
  "mcp_init_completed",
  "mcp_init_cancelled",
  "mcp_tool_call_started",
  "mcp_tool_call_completed",
  "mcp_transport_error",
  "mcp_transport_decode_error",
  "mcp_transport_reconnect",
  "mcp_auth_retry",
  "mcp_health_check",
  "mcp_server_toggled",
] as const;
export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

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
      redirectKind: string | null;
      /** Raw `turn` object when present (upstream TurnInfo). */
      turn: unknown;
    }
  | {
      type: "turn_ended";
      at: number;
      outcome: TurnOutcome;
      cancellationCategory: string | null;
      cancellationContext: unknown;
    }
  | { type: "phase_changed"; at: number; phase: Phase }
  | { type: "first_token"; at: number }
  | { type: "loop_started"; at: number; loopIndex: number }
  | { type: "tool_started"; at: number; toolName: string }
  | { type: "tool_completed"; at: number; toolName: string; durationMs: number; outcome: ToolOutcome }
  | { type: "permission_requested"; at: number; toolName: string }
  | {
      type: "permission_resolved";
      at: number;
      toolName: string;
      decision: PermissionDecision;
      waitMs: number;
    }
  | { type: "yolo_toggled"; at: number; enabled: boolean }
  | {
      type: "interjected";
      at: number;
      source: string;
      imageCount: number;
      redirectKind: string | null;
    }
  /** Any MCP_* event collapsed under type "mcp" with the original subtype. */
  | {
      type: "mcp";
      at: number;
      subtype: string;
      serverName: string | null;
      healthy: boolean | null;
      fields: JObj;
    }
  /**
   * Goal / todo-gate / laziness orchestration and any other fully-known type
   * that does not need a dedicated app-facing shape yet. `fields` is the raw
   * line object (minus type/ts) so no data is dropped.
   */
  | { type: "orchestration"; at: number; subtype: KnownEventType | string; fields: JObj }
  /** Truly unknown future vocabulary. */
  | { type: "other"; at: number; subtype: string; fields: JObj };

const KNOWN_PHASES: readonly string[] = PHASES;
const KNOWN_SET = new Set<string>(KNOWN_EVENT_TYPES as readonly string[]);
const TOOL_OUTCOME_SET = new Set<string>(TOOL_OUTCOMES);
const PERM_SET = new Set<string>(PERMISSION_DECISIONS);
const TURN_SET = new Set<string>(TURN_OUTCOMES);

export function asPhase(v: string): Phase | null {
  return KNOWN_PHASES.includes(v) ? (v as Phase) : null;
}

export function asToolOutcome(v: string): ToolOutcome | null {
  return TOOL_OUTCOME_SET.has(v) ? (v as ToolOutcome) : null;
}

export function asPermissionDecision(v: string): PermissionDecision | null {
  return PERM_SET.has(v) ? (v as PermissionDecision) : null;
}

export function asTurnOutcome(v: string): TurnOutcome | null {
  return TURN_SET.has(v) ? (v as TurnOutcome) : null;
}

function optStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function restFields(o: JObj, drop: string[]): JObj {
  const out: JObj = {};
  const d = new Set(drop);
  for (const [k, v] of Object.entries(o)) {
    if (!d.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Parse one events.jsonl line. Returns null only for unparseable lines
 * (torn/corrupt) — skip and continue per the torn-line contract. A line
 * without a parseable `ts` counts as malformed: the upstream EventWriter
 * always stamps RFC3339, and inventing a present-day time here would
 * poison latency series and backfill ordering with fabricated values.
 */
export function parseEventLine(line: string): GrokEvent | null {
  const o = parseObj(line);
  if (o === null) return null;
  // Wire uses "mcp_oauth_discovery_timeout"; some revs used "mcp_o_auth_..."
  let type = str(o["type"]);
  if (type === "mcp_o_auth_discovery_timeout") type = "mcp_oauth_discovery_timeout";
  if (type === "") return null;
  const ts = Date.parse(str(o["ts"]));
  if (!Number.isFinite(ts)) return null;
  const fields = restFields(o, ["type", "ts"]);

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
        redirectKind: optStr(o["redirect_kind"]),
        turn: o["turn"] ?? null,
      };
    case "turn_ended": {
      const raw = str(o["outcome"], "completed");
      return {
        type,
        at: ts,
        outcome: asTurnOutcome(raw) ?? "completed",
        cancellationCategory: optStr(o["cancellation_category"]),
        cancellationContext: o["cancellation_context"] ?? null,
      };
    }
    case "phase_changed": {
      const phase = asPhase(str(o["phase"]));
      return phase === null
        ? { type: "other", at: ts, subtype: "phase_changed", fields }
        : { type, at: ts, phase };
    }
    case "first_token":
      return { type, at: ts };
    case "loop_started":
      return { type, at: ts, loopIndex: num(o["loop_index"]) };
    case "tool_started":
      return { type, at: ts, toolName: str(o["tool_name"], "?") };
    case "tool_completed": {
      const raw = str(o["outcome"], "success");
      return {
        type,
        at: ts,
        toolName: str(o["tool_name"], "?"),
        durationMs: num(o["duration_ms"]),
        outcome: asToolOutcome(raw) ?? "error",
      };
    }
    case "permission_requested":
      return { type, at: ts, toolName: str(o["tool_name"], "?") };
    case "permission_resolved": {
      const raw = str(o["decision"], "allow");
      return {
        type,
        at: ts,
        toolName: str(o["tool_name"], "?"),
        decision: asPermissionDecision(raw) ?? "allow",
        waitMs: num(o["wait_ms"]),
      };
    }
    case "yolo_toggled":
      return { type, at: ts, enabled: bool(o["enabled"]) };
    case "interjected":
      return {
        type,
        at: ts,
        source: str(o["source"]),
        imageCount: num(o["image_count"]),
        redirectKind: optStr(o["redirect_kind"]),
      };
    default:
      if (type.startsWith("mcp_")) {
        return {
          type: "mcp",
          at: ts,
          subtype: type,
          serverName: optStr(o["server_name"]),
          healthy: typeof o["healthy"] === "boolean" ? o["healthy"] : null,
          fields,
        };
      }
      if (KNOWN_SET.has(type)) {
        return { type: "orchestration", at: ts, subtype: type, fields };
      }
      return { type: "other", at: ts, subtype: type, fields };
  }
}

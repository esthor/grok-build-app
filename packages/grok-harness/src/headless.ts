import { num, parseObj, str, sub, type JObj } from "./json.ts";

// Schemas for headless grok (`grok -p`) output. Mirrors
// crates/codegen/xai-grok-pager/src/headless.rs.
//
// ⚠️ Usage-field trap: headless `usage.input_tokens` is UNCACHED input
// (full − cache reads), the opposite convention from updates.jsonl's
// `turn_completed.usage.inputTokens` (which includes cache reads). The mixed
// snake_case/camelCase in the JSON result is frozen upstream for
// compatibility — do not "fix" it here.


/** One NDJSON line of `--output-format streaming-json`. The upstream set is
 * documented as non-exhaustive: switch on `type` and ignore unknowns. */
export type StreamingJsonEvent =
  | { type: "text"; data: string }
  | { type: "thought"; data: string }
  | { type: "end"; stopReason: string; sessionId: string; requestId: string }
  | { type: "error"; message: string }
  | { type: "max_turns_reached" }
  | { type: "auto_compact_started"; percentage: number }
  | { type: "auto_compact_completed" }
  | { type: "auto_compact_failed"; error: string }
  | { type: "auto_compact_cancelled" }
  | { type: "auto_continue_completed"; totalTokens: number }
  | { type: "image_compressed"; message: string }
  | { type: "unknown"; raw: string };

export function parseStreamingJsonLine(line: string): StreamingJsonEvent | null {
  const o = parseObj(line);
  if (o === null) return null;
  const type = str(o["type"]);
  switch (type) {
    case "text":
    case "thought":
      return { type, data: str(o["data"]) };
    case "end":
      return {
        type,
        stopReason: str(o["stopReason"]),
        sessionId: str(o["sessionId"]),
        requestId: str(o["requestId"]),
      };
    case "error":
      return { type, message: str(o["message"]) };
    case "max_turns_reached":
    case "auto_compact_completed":
    case "auto_compact_cancelled":
      return { type };
    case "auto_compact_started":
      return { type, percentage: num(o["percentage"]) };
    case "auto_compact_failed":
      return { type, error: str(o["error"]) };
    case "auto_continue_completed":
      return { type, totalTokens: num(o["total_tokens"]) };
    case "image_compressed":
      return { type, message: str(o["message"]) };
    default:
      return { type: "unknown", raw: line };
  }
}

/** Final object of `--output-format json` (snake_case totals; camelCase
 * per-model breakdown — frozen upstream). */
export type HeadlessJsonResult = {
  text: string;
  stopReason: string;
  sessionId: string;
  requestId: string;
  numTurns: number;
  /** UNCACHED input tokens (see header warning). */
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  usageIsIncomplete: boolean;
  costIsPartial: boolean;
  /** Fail-closed: null means unknown, never free. */
  totalCostUsdTicks: number | null;
  /** Float dollars when present (prefer ticks). */
  totalCostUsd: number | null;
  /** Per-model breakdown (camelCase keys inside). */
  modelUsage: JObj | null;
  /** Raw root for unmodeled fields. */
  raw: JObj;
};

export function parseHeadlessJsonResult(text: string): HeadlessJsonResult | null {
  const o = parseObj(text);
  if (o === null) return null;
  const usage = sub(o["usage"]) ?? {};
  const modelUsage = sub(o["modelUsage"]);
  return {
    text: str(o["text"]),
    stopReason: str(o["stopReason"]),
    sessionId: str(o["sessionId"]),
    requestId: str(o["requestId"]),
    numTurns: num(o["num_turns"]),
    inputTokens: num(usage["input_tokens"]),
    outputTokens: num(usage["output_tokens"]),
    cacheReadInputTokens: num(usage["cache_read_input_tokens"]),
    reasoningTokens: num(usage["reasoning_tokens"]),
    totalTokens: num(usage["total_tokens"]),
    usageIsIncomplete: o["usage_is_incomplete"] === true,
    costIsPartial: o["cost_is_partial"] === true,
    totalCostUsdTicks: typeof o["total_cost_usd_ticks"] === "number" ? o["total_cost_usd_ticks"] : null,
    totalCostUsd: typeof o["total_cost_usd"] === "number" ? o["total_cost_usd"] : null,
    modelUsage,
    raw: o,
  };
}
// Schema for a session's updates.jsonl — the authoritative ACP transcript.
// Mirrors SessionUpdateEnvelope in xai-grok-shell storage/mod.rs: one
// envelope per line, `method` is "session/update" (ACP) or
// "_x.ai/session/update" (xAI extension), and `params.update.sessionUpdate`
// is the discriminator.
//
// ⚠️ Token semantics (upstream-documented, easy to get wrong):
// - `turn_completed.usage.inputTokens` INCLUDES cache reads. Headless
//   `grok -p --output-format json` reports UNCACHED input. Never mix them.
// - `costUsdTicks` is integer ticks, 1e10 == $1, and is fail-closed: absent
//   or `usageIsIncomplete`/`costIsPartial` means UNKNOWN, never free.
// - `params._meta.totalTokens` is the harness's running context-size
//   estimate (bytes/4) at that moment — it goes DOWN on compaction.

import { isObj, num, parseObj, str, sub, type JObj } from "./json.ts";
import type { CanonicalToolMeta } from "./tools.ts";

export const ACP_UPDATE_METHOD = "session/update";
export const XAI_UPDATE_METHOD = "_x.ai/session/update";
export const TOOL_META_KEY = "x.ai/tool";

export type UpdateKind =
  | "user_message_chunk"
  | "agent_message_chunk"
  | "agent_thought_chunk"
  | "tool_call"
  | "tool_call_update"
  | "plan"
  | "available_commands_update"
  | "current_mode_update"
  | "turn_completed";

export type PromptUsageModel = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedReadTokens: number;
  reasoningTokens: number;
  modelCalls: number;
  apiDurationMs: number;
  costUsdTicks: number | null;
  costIsPartial: boolean;
};

export type PromptUsage = PromptUsageModel & {
  numTurns: number;
  usageIsIncomplete: boolean;
};

export type UpdateEnvelope = {
  /** Envelope write time (unix seconds). */
  timestamp: number;
  method: typeof ACP_UPDATE_METHOD | typeof XAI_UPDATE_METHOD;
  sessionId: string;
  kind: UpdateKind | string;
  /** The raw `params.update` object for fields not modeled here. */
  update: JObj;
  /** Milliseconds timestamp from `_meta.agentTimestampMs`, if present. */
  agentTimestampMs: number | null;
  /** Running context-size estimate from `_meta.totalTokens`, if present. */
  totalTokens: number | null;
};

export function parseUpdateLine(line: string): UpdateEnvelope | null {
  const o = parseObj(line);
  if (o === null) return null;
  const method = str(o["method"]);
  if (method !== ACP_UPDATE_METHOD && method !== XAI_UPDATE_METHOD) return null;
  const params = sub(o["params"]);
  if (params === null) return null;
  const update = sub(params["update"]);
  if (update === null) return null;
  const meta = sub(params["_meta"]);
  return {
    timestamp: num(o["timestamp"]),
    method,
    sessionId: str(params["sessionId"]),
    kind: str(update["sessionUpdate"]),
    update,
    agentTimestampMs: meta !== null && typeof meta["agentTimestampMs"] === "number" ? meta["agentTimestampMs"] : null,
    totalTokens: meta !== null && typeof meta["totalTokens"] === "number" ? meta["totalTokens"] : null,
  };
}

/** Text of a message/thought chunk update, or "" when absent. */
export function chunkText(update: JObj): string {
  const content = sub(update["content"]);
  return content !== null ? str(content["text"]) : "";
}

/** The `x.ai/tool` metadata riding a tool_call update, if present and sane. */
export function toolMetaOf(update: JObj): CanonicalToolMeta | null {
  const meta = sub(update["_meta"]);
  const tool = meta !== null ? sub(meta[TOOL_META_KEY]) : null;
  if (tool === null) return null;
  const name = str(tool["name"]);
  if (name === "") return null;
  return {
    version: num(tool["version"], 1),
    name,
    kind: str(tool["kind"], "other"),
    namespace: str(tool["namespace"], ""),
    label: str(tool["label"], name),
    read_only: tool["read_only"] === true,
    ...(tool["input"] !== undefined ? { input: tool["input"] } : {}),
  };
}

/** Usage payload of a `turn_completed` update, fail-closed on cost. */
export function turnUsageOf(update: JObj): PromptUsage | null {
  const usage = sub(update["usage"]);
  if (usage === null) return null;
  const model = (o: JObj): PromptUsageModel => ({
    inputTokens: num(o["inputTokens"]),
    outputTokens: num(o["outputTokens"]),
    totalTokens: num(o["totalTokens"]),
    cachedReadTokens: num(o["cachedReadTokens"]),
    reasoningTokens: num(o["reasoningTokens"]),
    modelCalls: num(o["modelCalls"]),
    apiDurationMs: num(o["apiDurationMs"]),
    costUsdTicks: typeof o["costUsdTicks"] === "number" ? o["costUsdTicks"] : null,
    costIsPartial: o["costIsPartial"] === true,
  });
  return {
    ...model(usage),
    numTurns: num(usage["numTurns"]),
    usageIsIncomplete: usage["usageIsIncomplete"] === true,
  };
}

/** Summarize a tool_call's rawInput into a one-line human detail string. */
export function summarizeRawInput(update: JObj, max = 110): string {
  const raw = sub(update["rawInput"]);
  if (raw === null) return "";
  for (const key of ["command", "pattern", "file_path", "path", "query", "url", "prompt", "description"]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim() !== "") {
      const clean = v.replace(/\s+/g, " ").trim();
      return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
    }
  }
  return "";
}

export function isUpdateObj(v: unknown): v is JObj {
  return isObj(v);
}

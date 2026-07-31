// Schema for a session's updates.jsonl — the authoritative ACP + xAI transcript.
// Mirrors SessionUpdateEnvelope in xai-grok-shell storage/mod.rs:
//   method: "session/update" (ACP) | "_x.ai/session/update" (xAI extension)
//   params.update.sessionUpdate: discriminator
//
// ⚠️ Token semantics:
// - turn_completed.usage.inputTokens INCLUDES cache reads.
//   Headless grok -p json reports UNCACHED input. Never mix them.
// - costUsdTicks is integer ticks, 1e10 == $1, fail-closed: absent or
//   usageIsIncomplete/costIsPartial means UNKNOWN, never free.
// - params._meta.totalTokens is context occupancy (bytes/4), drops on compaction.

import { num, parseObj, str, sub, type JObj } from "./json.ts";
import type { CanonicalToolMeta } from "./tools.ts";

export const ACP_UPDATE_METHOD = "session/update";
export const XAI_UPDATE_METHOD = "_x.ai/session/update";
export const TOOL_META_KEY = "x.ai/tool";

/** ACP standard sessionUpdate kinds (agent-client-protocol). */
export const ACP_UPDATE_KINDS = [
  "user_message_chunk",
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
  "available_commands_update",
  "current_mode_update",
] as const;

/**
 * xAI extension sessionUpdate kinds
 * (xai-grok-shell extensions/notification.rs SessionUpdate, tag=sessionUpdate snake_case).
 */
export const XAI_UPDATE_KINDS = [
  "diff_review",
  "retry_state",
  "auto_compact_started",
  "auto_compact_completed",
  "auto_compact_failed",
  "auto_compact_cancelled",
  "memory_flush_started",
  "memory_flush_completed",
  "memory_dream_completed",
  "memory_session_saved",
  "auto_continue_completed",
  "feedback_request",
  "relay_sync_status",
  "auto_recovery_started",
  "auto_recovery_exhausted",
  "hook_annotation",
  "hook_execution",
  "hooks_changed",
  "plugins_changed",
  "plugin_updates_installed",
  "session_summary_generated",
  "session_recap",
  "session_recap_unavailable",
  "compaction_checkpoint",
  "rewind_marker",
  "task_completed",
  "task_backgrounded",
  "subagent_spawned",
  "subagent_progress",
  "subagent_finished",
  "scheduled_task_created",
  "scheduled_task_fired",
  "scheduled_task_deleted",
  "monitor_event",
  "model_auto_switched",
  "model_changed",
  "tool_call_delta_chunk",
  "image_compressed",
  "image_dropped",
  "memory_files",
  "workflow_updated",
  "goal_updated",
  "pending_interaction",
  "interaction_resolved",
  "turn_completed",
] as const;

/** Union of every known sessionUpdate discriminator. */
export const KNOWN_UPDATE_KINDS = [...ACP_UPDATE_KINDS, ...XAI_UPDATE_KINDS] as const;
export type UpdateKind = (typeof KNOWN_UPDATE_KINDS)[number];

const KNOWN_KIND_SET = new Set<string>(KNOWN_UPDATE_KINDS as readonly string[]);

export function isKnownUpdateKind(k: string): k is UpdateKind {
  return KNOWN_KIND_SET.has(k);
}

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
  /** The raw params.update object for fields not modeled by accessors. */
  update: JObj;
  agentTimestampMs: number | null;
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
    agentTimestampMs:
      meta !== null && typeof meta["agentTimestampMs"] === "number" ? meta["agentTimestampMs"] : null,
    totalTokens: meta !== null && typeof meta["totalTokens"] === "number" ? meta["totalTokens"] : null,
  };
}

export function chunkText(update: JObj): string {
  const content = sub(update["content"]);
  return content !== null ? str(content["text"]) : "";
}

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

export function turnUsageOf(update: JObj): PromptUsage | null {
  const usage = sub(update["usage"]);
  if (usage === null) return null;
  return {
    inputTokens: num(usage["inputTokens"]),
    outputTokens: num(usage["outputTokens"]),
    totalTokens: num(usage["totalTokens"]),
    cachedReadTokens: num(usage["cachedReadTokens"]),
    reasoningTokens: num(usage["reasoningTokens"]),
    modelCalls: num(usage["modelCalls"]),
    apiDurationMs: num(usage["apiDurationMs"]),
    costUsdTicks: typeof usage["costUsdTicks"] === "number" ? usage["costUsdTicks"] : null,
    costIsPartial: usage["costIsPartial"] === true,
    numTurns: num(usage["numTurns"]),
    usageIsIncomplete: usage["usageIsIncomplete"] === true,
  };
}

/** Effective cost for display: null when unknown (fail-closed). */
export function effectiveCostUsdTicks(u: PromptUsage): number | null {
  if (u.costUsdTicks === null || u.usageIsIncomplete || u.costIsPartial) return null;
  return u.costUsdTicks;
}

export function recapOf(update: JObj): { summary: string; auto: boolean } | null {
  const summary = str(update["summary"]);
  if (summary === "") return null;
  return { summary, auto: update["auto"] === true };
}

export type SubagentSpawn = {
  subagentId: string;
  childSessionId: string;
  parentSessionId: string;
  parentPromptId: string;
  subagentType: string;
  description: string;
  capabilityMode: string;
  model: string;
  effectiveContextSource: string;
  contextNormalized: boolean;
  persona: string;
  role: string;
  resumedFrom: string;
  workflowRunId: string;
};

export function subagentSpawnOf(update: JObj): SubagentSpawn | null {
  const subagentId = str(update["subagent_id"]);
  if (subagentId === "") return null;
  return {
    subagentId,
    childSessionId: str(update["child_session_id"]),
    parentSessionId: str(update["parent_session_id"]),
    parentPromptId: str(update["parent_prompt_id"]),
    subagentType: str(update["subagent_type"]),
    description: str(update["description"]),
    capabilityMode: str(update["capability_mode"]),
    model: str(update["model"]),
    effectiveContextSource: str(update["effective_context_source"]),
    contextNormalized: update["context_normalized"] === true,
    persona: str(update["persona"]),
    role: str(update["role"]),
    resumedFrom: str(update["resumed_from"]),
    workflowRunId: str(update["workflow_run_id"]),
  };
}

export type SubagentProgress = {
  subagentId: string;
  parentSessionId: string;
  childSessionId: string;
  durationMs: number;
  turnCount: number;
  toolCallCount: number;
  tokensUsed: number;
  contextWindowTokens: number;
  contextUsagePct: number;
  toolsUsed: unknown;
  errorCount: number;
};

export function subagentProgressOf(update: JObj): SubagentProgress | null {
  const subagentId = str(update["subagent_id"]);
  if (subagentId === "") return null;
  return {
    subagentId,
    parentSessionId: str(update["parent_session_id"]),
    childSessionId: str(update["child_session_id"]),
    durationMs: num(update["duration_ms"]),
    turnCount: num(update["turn_count"]),
    toolCallCount: num(update["tool_call_count"]),
    tokensUsed: num(update["tokens_used"]),
    contextWindowTokens: num(update["context_window_tokens"]),
    contextUsagePct: num(update["context_usage_pct"]),
    toolsUsed: update["tools_used"] ?? null,
    errorCount: num(update["error_count"]),
  };
}

export type SubagentFinished = {
  subagentId: string;
  childSessionId: string;
  status: string;
  error: string;
  toolCalls: number;
  turns: number;
  durationMs: number;
  tokensUsed: number;
  output: string;
  willWake: boolean;
};

export function subagentFinishedOf(update: JObj): SubagentFinished | null {
  const subagentId = str(update["subagent_id"]);
  if (subagentId === "") return null;
  return {
    subagentId,
    childSessionId: str(update["child_session_id"]),
    status: str(update["status"]),
    error: str(update["error"]),
    toolCalls: num(update["tool_calls"]),
    turns: num(update["turns"]),
    durationMs: num(update["duration_ms"]),
    tokensUsed: num(update["tokens_used"]),
    output: str(update["output"]),
    willWake: update["will_wake"] === true,
  };
}

export type TaskBackgrounded = {
  toolCallId: string;
  taskId: string;
  command: string;
  cwd: string;
  outputFile: string;
  description: string;
  monitorDescription: string;
};

export function taskBackgroundedOf(update: JObj): TaskBackgrounded | null {
  const taskId = str(update["task_id"]);
  if (taskId === "") return null;
  return {
    toolCallId: str(update["tool_call_id"]),
    taskId,
    command: str(update["command"]),
    cwd: str(update["cwd"]),
    outputFile: str(update["output_file"]),
    description: str(update["description"]),
    monitorDescription: str(update["monitor_description"]),
  };
}

export type TaskCompleted = {
  taskSnapshot: JObj;
  willWake: boolean;
};

export function taskCompletedOf(update: JObj): TaskCompleted | null {
  const snap = sub(update["task_snapshot"]);
  if (snap === null) return null;
  return { taskSnapshot: snap, willWake: update["will_wake"] === true };
}

export type HookExecution = {
  eventName: string;
  toolName: string;
  promptId: string;
  runs: unknown;
};

export function hookExecutionOf(update: JObj): HookExecution | null {
  const eventName = str(update["event_name"]);
  if (eventName === "") return null;
  return {
    eventName,
    toolName: str(update["tool_name"]),
    promptId: str(update["prompt_id"]),
    runs: update["runs"] ?? null,
  };
}

export type AutoCompactStarted = {
  tokensUsed: number;
  contextWindow: number;
  percentage: number;
  reason: string;
};

export function autoCompactStartedOf(update: JObj): AutoCompactStarted | null {
  // Align with the sibling accessors: absent payload → null, not zeros.
  if (typeof update["percentage"] !== "number" && typeof update["tokens_used"] !== "number") {
    return null;
  }
  return {
    tokensUsed: num(update["tokens_used"]),
    contextWindow: num(update["context_window"]),
    percentage: num(update["percentage"]),
    reason: str(update["reason"]),
  };
}

export type ScheduledTask = {
  taskId: string;
  prompt: string;
  humanSchedule: string;
  nextFireAt: string;
  subagentId: string;
};

export function scheduledTaskOf(update: JObj): ScheduledTask | null {
  const taskId = str(update["task_id"]);
  if (taskId === "") return null;
  return {
    taskId,
    prompt: str(update["prompt"]),
    humanSchedule: str(update["human_schedule"]),
    nextFireAt: str(update["next_fire_at"]),
    subagentId: str(update["subagent_id"]),
  };
}

export type MonitorEvent = {
  taskId: string;
  description: string;
  eventText: string;
};

export function monitorEventOf(update: JObj): MonitorEvent | null {
  const taskId = str(update["task_id"]);
  if (taskId === "") return null;
  return {
    taskId,
    description: str(update["description"]),
    eventText: str(update["event_text"]),
  };
}

export type ModelChanged = {
  modelId: string;
  reasoningEffort: string;
  previousModelId: string;
  reason: string;
};

export function modelChangedOf(update: JObj): ModelChanged | null {
  const modelId = str(update["model_id"], str(update["new_model_id"]));
  if (modelId === "") return null;
  return {
    modelId,
    reasoningEffort: str(update["reasoning_effort"]),
    previousModelId: str(update["previous_model_id"]),
    reason: str(update["reason"]),
  };
}

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

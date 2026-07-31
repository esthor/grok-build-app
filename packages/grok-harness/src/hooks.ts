// Hook surface — event names, config shapes, and execution DTOs that appear
// on the updates stream (hook_execution / hooks_changed) and in config.toml.
// Mirrored from crates/codegen/xai-grok-hooks.

import { parseObj, str, type JObj } from "./json.ts";

/**
 * Canonical hook event names (display / dispatch keys).
 * Aliases (camelCase, Cursor spellings) are accepted by parseHookEventName.
 */
export const HOOK_EVENT_NAMES = [
  "session_start",
  "user_prompt_submit",
  "pre_tool_use",
  "post_tool_use",
  "post_tool_use_failure",
  "permission_denied",
  "stop",
  "stop_failure",
  "notification",
  "subagent_start",
  "subagent_stop",
  "pre_compact",
  "post_compact",
  "session_end",
] as const;
export type HookEventName = (typeof HOOK_EVENT_NAMES)[number];

const ALIASES: Record<string, HookEventName> = {
  session_start: "session_start",
  SessionStart: "session_start",
  sessionStart: "session_start",
  user_prompt_submit: "user_prompt_submit",
  UserPromptSubmit: "user_prompt_submit",
  beforeSubmitPrompt: "user_prompt_submit",
  pre_tool_use: "pre_tool_use",
  PreToolUse: "pre_tool_use",
  preToolUse: "pre_tool_use",
  beforeShellExecution: "pre_tool_use",
  beforeMCPExecution: "pre_tool_use",
  beforeReadFile: "pre_tool_use",
  post_tool_use: "post_tool_use",
  PostToolUse: "post_tool_use",
  postToolUse: "post_tool_use",
  afterShellExecution: "post_tool_use",
  afterMCPExecution: "post_tool_use",
  afterFileEdit: "post_tool_use",
  afterAgentResponse: "post_tool_use",
  afterAgentThought: "post_tool_use",
  post_tool_use_failure: "post_tool_use_failure",
  PostToolUseFailure: "post_tool_use_failure",
  postToolUseFailure: "post_tool_use_failure",
  permission_denied: "permission_denied",
  PermissionDenied: "permission_denied",
  permissionDenied: "permission_denied",
  stop: "stop",
  Stop: "stop",
  stop_failure: "stop_failure",
  StopFailure: "stop_failure",
  stopFailure: "stop_failure",
  notification: "notification",
  Notification: "notification",
  subagent_start: "subagent_start",
  SubagentStart: "subagent_start",
  subagentStart: "subagent_start",
  subagent_stop: "subagent_stop",
  SubagentStop: "subagent_stop",
  subagentStop: "subagent_stop",
  // Legacy alias collapses to subagent_stop
  subagent_end: "subagent_stop",
  SubagentEnd: "subagent_stop",
  subagentEnd: "subagent_stop",
  pre_compact: "pre_compact",
  PreCompact: "pre_compact",
  preCompact: "pre_compact",
  post_compact: "post_compact",
  PostCompact: "post_compact",
  postCompact: "post_compact",
  session_end: "session_end",
  SessionEnd: "session_end",
  sessionEnd: "session_end",
};

export function parseHookEventName(key: string): HookEventName | null {
  return ALIASES[key] ?? null;
}

export type HookHandlerType = "command" | "http";

/** One raw handler entry from hooks config (JSON or TOML-decoded). */
export type HookHandler = {
  type: HookHandlerType | string;
  command: string;
  url: string;
  /** Seconds. */
  timeout: number | null;
  env: Record<string, string>;
};

export type HookMatcherGroup = {
  matcher: string | null;
  hooks: HookHandler[];
};

export type HooksMap = {
  events: Partial<Record<HookEventName, HookMatcherGroup[]>>;
  skippedEvents: string[];
};

export function parseHooksMap(value: unknown): HooksMap {
  const events: HooksMap["events"] = {};
  const skippedEvents: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { events, skippedEvents };
  }
  for (const [key, val] of Object.entries(value as JObj)) {
    const name = parseHookEventName(key);
    if (name === null) {
      skippedEvents.push(key);
      continue;
    }
    if (!Array.isArray(val)) {
      skippedEvents.push(key);
      continue;
    }
    const groups: HookMatcherGroup[] = [];
    for (const g of val) {
      if (typeof g !== "object" || g === null) continue;
      const go = g as JObj;
      const hooksRaw = go["hooks"];
      const hooks: HookHandler[] = [];
      if (Array.isArray(hooksRaw)) {
        for (const h of hooksRaw) {
          if (typeof h !== "object" || h === null) continue;
          const ho = h as JObj;
          const envRaw = ho["env"];
          const env: Record<string, string> = {};
          if (typeof envRaw === "object" && envRaw !== null && !Array.isArray(envRaw)) {
            for (const [ek, ev] of Object.entries(envRaw as JObj)) {
              if (typeof ev === "string") env[ek] = ev;
            }
          }
          hooks.push({
            type: str(ho["type"], "command"),
            command: str(ho["command"]),
            url: str(ho["url"]),
            timeout: typeof ho["timeout"] === "number" ? ho["timeout"] : null,
            env,
          });
        }
      }
      groups.push({
        matcher: typeof go["matcher"] === "string" ? go["matcher"] : null,
        hooks,
      });
    }
    events[name] = [...(events[name] ?? []), ...groups];
  }
  return { events, skippedEvents };
}

/** Parse a full hooks JSON document (the `hooks` object only). */
export function parseHooksJson(text: string): HooksMap | null {
  const o = parseObj(text);
  if (o === null) return null;
  return parseHooksMap(o);
}

export const DEFAULT_HOOK_TIMEOUT_SECS = 5;
export const DEFAULT_STOP_GATE_TIMEOUT_SECS = 600;

/**
 * Stdin envelope posted to command hooks (camelCase on the wire).
 * Payload fields (toolName, toolInput, …) are flattened alongside these.
 */
export type HookEventEnvelope = {
  hookEventName: string;
  sessionId: string;
  cwd: string;
  workspaceRoot: string;
  timestamp: string;
  transcriptPath: string;
  clientIdentifier: string;
  promptId: string;
  permissionMode: string;
  /** Remaining payload fields (toolName, toolUseId, toolInput, …). */
  payload: JObj;
};

export function parseHookEventEnvelope(text: string): HookEventEnvelope | null {
  const o = parseObj(text);
  if (o === null) return null;
  const hookEventName = str(o["hookEventName"]);
  if (hookEventName === "") return null;
  const known = new Set([
    "hookEventName",
    "sessionId",
    "cwd",
    "workspaceRoot",
    "timestamp",
    "transcriptPath",
    "clientIdentifier",
    "promptId",
    "permissionMode",
  ]);
  const payload: JObj = {};
  for (const [k, v] of Object.entries(o)) {
    if (!known.has(k)) payload[k] = v;
  }
  return {
    hookEventName,
    sessionId: str(o["sessionId"]),
    cwd: str(o["cwd"]),
    workspaceRoot: str(o["workspaceRoot"]),
    timestamp: str(o["timestamp"]),
    transcriptPath: str(o["transcriptPath"]),
    clientIdentifier: str(o["clientIdentifier"]),
    promptId: str(o["promptId"]),
    permissionMode: str(o["permissionMode"]),
    payload,
  };
}

/** Gate response from x.ai/hooks/run — fail-open unless decision is deny. */
export type HookGateDecision = {
  decision: "continue" | "deny" | string;
  reason: string;
  additionalContext: string;
};

export function parseHookGateDecision(v: unknown): HookGateDecision | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as JObj;
  return {
    decision: str(o["decision"], "continue"),
    reason: str(o["reason"]),
    additionalContext: str(o["additionalContext"]),
  };
}

// ACP + xAI extension method names apps use on the leader/ACP channel.
// Sourced from xai-grok-shell agent handlers and leader protocol comments.
// Underscore-prefixed forms (`_x.ai/...`) are the notification/wire variants
// for some methods — accept both when matching.

/** Normalize method: strip leading underscore used on some notification paths. */
export function canonicalMethod(method: string): string {
  return method.startsWith("_") ? method.slice(1) : method;
}

export function methodsEqual(a: string, b: string): boolean {
  return canonicalMethod(a) === canonicalMethod(b);
}

// ── Core ACP ─────────────────────────────────────────────────────────────
export const ACP_SESSION_UPDATE = "session/update";
export const ACP_SESSION_NEW = "session/new";
export const ACP_SESSION_LOAD = "session/load";
export const ACP_SESSION_PROMPT = "session/prompt";
export const ACP_SESSION_CANCEL = "session/cancel";

// ── xAI session / roster ─────────────────────────────────────────────────
export const XAI_SESSION_UPDATE = "_x.ai/session/update";
export const XAI_SESSION_INFO = "x.ai/session/info";
export const XAI_SESSION_CLOSE = "x.ai/session/close";
export const XAI_SESSION_LIST = "x.ai/session/list";
export const XAI_SESSIONS_LIST = "x.ai/sessions/list";
export const XAI_SESSIONS_CHANGED = "x.ai/sessions/changed";
export const XAI_SESSION_USAGE = "x.ai/session/usage";
export const XAI_SESSION_UPDATES = "x.ai/session/updates";
export const XAI_SESSION_PROMPT_COMPLETE = "x.ai/session/prompt_complete";
export const XAI_SESSION_NOTIFICATION = "x.ai/session_notification";

// ── Session summaries ────────────────────────────────────────────────────
export const XAI_SESSION_SUMMARIES_SESSION_LIST = "x.ai/session_summaries/session_list";
export const XAI_SESSION_SUMMARIES_WORKSPACE_LIST = "x.ai/session_summaries/workspace_list";
export const XAI_SESSION_SUMMARIES_WORKSPACE_LIST_RECENT =
  "x.ai/session_summaries/workspace_list_recent";

// ── Queue ────────────────────────────────────────────────────────────────
export const XAI_QUEUE_REMOVE = "x.ai/queue/remove";
export const XAI_QUEUE_REORDER = "x.ai/queue/reorder";
export const XAI_QUEUE_CLEAR = "x.ai/queue/clear";
export const XAI_QUEUE_INTERJECT = "x.ai/queue/interject";
export const XAI_QUEUE_EDIT = "x.ai/queue/edit";
export const XAI_QUEUE_HOLD_EDIT = "x.ai/queue/hold_edit";
export const XAI_QUEUE_RELEASE_EDIT = "x.ai/queue/release_edit";

// ── Models / config / auth ───────────────────────────────────────────────
export const XAI_MODELS_UPDATE = "x.ai/models/update";
export const XAI_CONFIG_CHANGED = "x.ai/config_changed";
export const XAI_GET_API_KEY = "x.ai/getApiKey";
export const XAI_SET_API_KEY = "x.ai/setApiKey";

// ── Recap ────────────────────────────────────────────────────────────────
export const XAI_RECAP = "x.ai/recap";

// ── Internal reloads (leader → clients) ──────────────────────────────────
export const XAI_INTERNAL_RELOAD_SKILLS = "x.ai/internal/reload_skills";
export const XAI_INTERNAL_RELOAD_WORKFLOWS = "x.ai/internal/reload_workflows";
export const XAI_INTERNAL_RELOAD_MODELS = "x.ai/internal/reload_models";
export const XAI_INTERNAL_RELOAD_MODELS_CACHE = "x.ai/internal/reload_models_cache";
export const XAI_INTERNAL_RELOAD_ALL_MCP = "x.ai/internal/reload_all_mcp_servers";
export const XAI_INTERNAL_RELOAD_PROJECT_MCP = "x.ai/internal/reload_project_mcp_servers";
export const XAI_INTERNAL_AUTH_CLEARED = "x.ai/internal/auth_cleared";

/** Meta keys commonly attached to ACP requests/responses. */
export const META_TOOL = "x.ai/tool";
export const META_PERSIST = "x.ai/persist";
export const META_LEADER_CLIENT_ID = "x.ai/leaderClientId";
export const META_RUNNING_PROMPT_ID = "x.ai/runningPromptId";
export const META_DISPLAY_CWD = "x.ai/display_cwd";
export const META_SKIP_ENVRC = "x.ai/skip_envrc";
export const META_RESTORE_CODE = "x.ai/restore_code";
export const META_PARTIAL = "x.ai/partial";

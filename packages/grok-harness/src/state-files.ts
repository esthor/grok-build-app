// Schemas for grok's small JSON state files. These are written with
// atomic temp+rename (never torn, but the inode changes — re-open by path)
// and, importantly, on their own cadence:
//
// ⚠️ signals.json can lag the live streams by HOURS mid-session. Treat it
// as a seed for slow-moving values (context window size, ITL percentiles),
// never as the live counter source — fold events.jsonl/updates.jsonl for
// anything that moves.

import { num, parseObj, str, type JObj } from "./json.ts";
import { SESSION_ID_RE } from "./paths.ts";

/** One entry of ~/.grok/active_sessions.json (xai-grok-shell
 * active_sessions.rs). Crash-abandoned entries linger: verify pid liveness. */
export type ActiveSessionEntry = {
  sessionId: string;
  pid: number;
  cwd: string;
  openedAt: number;
};

export function parseActiveSessions(text: string): ActiveSessionEntry[] {
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: ActiveSessionEntry[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as JObj;
    const sessionId = str(o["session_id"]);
    const cwd = str(o["cwd"]);
    if (!SESSION_ID_RE.test(sessionId) || cwd === "") continue;
    out.push({
      sessionId,
      pid: num(o["pid"]),
      cwd,
      openedAt: Date.parse(str(o["opened_at"])) || 0,
    });
  }
  return out;
}

/** summary.json — session identity (xai-grok-shell persistence.rs Summary).
 * Optional upstream fields are normalized to defaults here. */
export type SessionSummary = {
  id: string;
  cwd: string;
  title: string;
  sessionSummary: string;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  numMessages: number;
  modelId: string;
  agentName: string;
  sandboxProfile: string;
  reasoningEffort: string;
  gitBranch: string;
  gitCommit: string;
  gitRootDir: string;
  /** "fork" | "subagent" | "subagent_fork" | "worktree" | "" — sessions whose
   * kind starts with "subagent" are hidden by default in grok's own UI. */
  sessionKind: string;
  parentSessionId: string;
  hidden: boolean;
  forkedAt: string;
  worktreeLabel: string;
};

export function parseSummary(text: string): SessionSummary | null {
  const o = parseObj(text);
  if (o === null) return null;
  const info = typeof o["info"] === "object" && o["info"] !== null ? (o["info"] as JObj) : null;
  const created = Date.parse(str(o["created_at"]));
  const updated = Date.parse(str(o["updated_at"]));
  const lastActive = Date.parse(str(o["last_active_at"]));
  return {
    id: info !== null ? str(info["id"]) : "",
    cwd: info !== null ? str(info["cwd"]) : "",
    title: str(o["generated_title"], str(o["session_summary"], "untitled")),
    sessionSummary: str(o["session_summary"]),
    createdAt: Number.isFinite(created) ? created : 0,
    updatedAt: Number.isFinite(updated) ? updated : 0,
    lastActiveAt: Number.isFinite(lastActive) ? lastActive : Number.isFinite(updated) ? updated : 0,
    numMessages: num(o["num_messages"]),
    modelId: str(o["current_model_id"], "?"),
    agentName: str(o["agent_name"], "grok"),
    sandboxProfile: str(o["sandbox_profile"]),
    reasoningEffort: str(o["reasoning_effort"]),
    gitBranch: str(o["head_branch"]),
    gitCommit: str(o["head_commit"]),
    gitRootDir: str(o["git_root_dir"]),
    sessionKind: str(o["session_kind"]),
    parentSessionId: str(o["parent_session_id"]),
    hidden: o["hidden"] === true,
    forkedAt: str(o["forked_at"]),
    worktreeLabel: str(o["worktree_label"]),
  };
}

/** signals.json — cumulative session counters (see staleness warning above).
 * Only the fields consumers currently rely on are modeled; the raw object is
 * returned alongside for the rest. */
export type SessionSignals = {
  contextTokensUsed: number;
  contextWindowTokens: number;
  compactionCount: number;
  itlP50Ms: number;
  itlP99Ms: number;
  errorCount: number;
  toolCallCount: number;
  turnCount: number;
  sessionDurationSeconds: number;
  raw: JObj;
};

export function parseSignals(text: string): SessionSignals | null {
  const o = parseObj(text);
  if (o === null) return null;
  return {
    contextTokensUsed: num(o["contextTokensUsed"]),
    contextWindowTokens: num(o["contextWindowTokens"]),
    compactionCount: num(o["compactionCount"]),
    itlP50Ms: num(o["itlP50Ms"]),
    itlP99Ms: num(o["itlP99Ms"]),
    errorCount: num(o["errorCount"]),
    toolCallCount: num(o["toolCallCount"]),
    turnCount: num(o["turnCount"]),
    sessionDurationSeconds: num(o["sessionDurationSeconds"]),
    raw: o,
  };
}

/** One hunk_records.jsonl line — per-hunk line attribution. Records repeat
 * per hunkId as edits evolve (eventType added/updated): keep the LATEST
 * record per hunkId and sum those, or churn double-counts. */
export type HunkRecord = {
  hunkId: string;
  filePath: string;
  hunkStart: number;
  hunkEnd: number;
  linesAdded: number;
  linesRemoved: number;
  authorType: "agent" | "human" | string;
  authorId: string;
  agentId: string;
  sessionId: string;
  at: number;
  promptIndex: number | null;
  sourceType: string;
  /** added | updated | removed */
  eventType: string;
  removalReason: string;
};

export function parseHunkLine(line: string): HunkRecord | null {
  const o = parseObj(line);
  if (o === null) return null;
  const hunkId = str(o["hunkId"]);
  if (hunkId === "") return null;
  return {
    hunkId,
    filePath: str(o["filePath"]),
    hunkStart: num(o["hunkStart"]),
    hunkEnd: num(o["hunkEnd"]),
    linesAdded: num(o["linesAdded"]),
    linesRemoved: num(o["linesRemoved"]),
    authorType: str(o["authorType"]),
    authorId: str(o["authorId"]),
    agentId: str(o["agentId"]),
    sessionId: str(o["sessionId"]),
    at: Date.parse(str(o["timestamp"])) || 0,
    promptIndex: typeof o["promptIndex"] === "number" ? o["promptIndex"] : null,
    sourceType: str(o["sourceType"]),
    eventType: str(o["eventType"]),
    removalReason: str(o["removalReason"]),
  };
}

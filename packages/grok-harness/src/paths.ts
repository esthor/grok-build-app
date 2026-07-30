// Where grok-build keeps its state on disk, and how session directories are
// named. Mirrors crates/codegen/xai-grok-config/src/paths.rs and
// crates/codegen/xai-grok-shared/src/session/mod.rs in the grok-build source.

/** Session ids are UUIDs (v7 when grok generates them). Anything that does
 * not match must never reach a path join. */
export const SESSION_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

/** File names inside a session directory (xai-grok-shell storage/mod.rs). */
export const SESSION_FILES = {
  summary: "summary.json",
  signals: "signals.json",
  plan: "plan.json",
  planMode: "plan_mode.json",
  chatHistory: "chat_history.jsonl",
  updates: "updates.jsonl",
  events: "events.jsonl",
  hunkRecords: "hunk_records.jsonl",
  rewindPoints: "rewind_points.jsonl",
  systemPrompt: "system_prompt.txt",
  promptContext: "prompt_context.json",
} as const;

/** Files that live at $GROK_HOME top level. */
export const HOME_FILES = {
  activeSessions: "active_sessions.json",
  config: "config.toml",
  pagerConfig: "pager.toml",
  unifiedLog: "logs/unified.jsonl",
  leaderSocket: "leader.sock",
} as const;

export type PathJoin = (...parts: string[]) => string;

/**
 * Resolve $GROK_HOME. The caller supplies the environment and home directory
 * so this stays runtime-agnostic (Bun server, Node, Tauri shell).
 */
export function grokHome(
  env: Record<string, string | undefined>,
  homedir: string,
  join: PathJoin,
): string {
  return env["GROK_HOME"] ?? join(homedir, ".grok");
}

export function sessionsRoot(home: string, join: PathJoin): string {
  return join(home, "sessions");
}

/**
 * Encode a cwd the way grok names its per-cwd session directories: URL-encode
 * the absolute path (`/Users/x/dev` → `%2FUsers%2Fx%2Fdev`). Paths longer
 * than 255 bytes use a `{slug}-{blake3_16}` scheme with a `.cwd` marker file
 * inside — resolve those by scanning and decoding, not by re-hashing.
 */
export function encodeCwdDirname(cwd: string): string {
  return encodeURIComponent(cwd);
}

/**
 * Decode a per-cwd directory name back to an absolute path. Returns null for
 * names that don't decode to an absolute path (e.g. hashed long-path dirs —
 * read their `.cwd` file instead).
 */
export function decodeCwdDirname(dirname: string): string | null {
  try {
    const decoded = decodeURIComponent(dirname);
    return decoded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Path of one session's directory (the fast path; verify existence and fall
 * back to a scan of `sessionsRoot` when encodings disagree). */
export function sessionDir(home: string, cwd: string, sessionId: string, join: PathJoin): string | null {
  if (!SESSION_ID_RE.test(sessionId)) return null;
  return join(sessionsRoot(home, join), encodeCwdDirname(cwd), sessionId);
}

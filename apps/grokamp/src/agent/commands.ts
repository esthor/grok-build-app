/**
 * grok-build's real slash-command surface, as advertised to ACP clients in
 * the initialize `_meta.availableCommands` payload (mirrored from the shell's
 * builtin catalog + the pager's own builtins). Grouped the way the user
 * guide groups them so the composer's autocomplete reads like the TUI's.
 *
 * Skills are user-invocable too and appear scoped (`/local:…`, `/user:…`);
 * a couple of representative entries are included and marked.
 */

export type CommandGroup =
  | "session"
  | "model"
  | "memory"
  | "extensions"
  | "workflow"
  | "agents"
  | "media"
  | "account"
  | "ui"
  | "skill";

export interface SlashCommand {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly group: CommandGroup;
  readonly hint: string;
  readonly argHint?: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  // session
  { name: "new", aliases: ["clear"], group: "session", hint: "start a fresh session" },
  { name: "resume", group: "session", hint: "reopen a previous session" },
  { name: "compact", group: "session", hint: "summarize and shrink context", argHint: "[focus]" },
  { name: "context", group: "session", hint: "show the context breakdown" },
  {
    name: "session-info",
    aliases: ["status", "info"],
    group: "session",
    hint: "session id, model, cwd",
  },
  { name: "fork", group: "session", hint: "branch this session", argHint: "[--worktree]" },
  { name: "rewind", group: "session", hint: "restore files + history to a point" },
  { name: "recap", group: "session", hint: "what happened while you were away" },
  { name: "export", group: "session", hint: "write the transcript to a file" },
  { name: "copy", group: "session", hint: "copy the last message", argHint: "[n] [path]" },
  { name: "rename", aliases: ["title"], group: "session", hint: "retitle the session" },
  { name: "quit", aliases: ["exit"], group: "session", hint: "leave" },

  // model & mode
  { name: "model", aliases: ["m"], group: "model", hint: "switch model" },
  {
    name: "effort",
    group: "model",
    hint: "reasoning effort tier",
    argHint: "<low|medium|high|xhigh>",
  },
  { name: "always-approve", group: "model", hint: "stop asking (yolo mode)" },
  { name: "auto", group: "model", hint: "auto permission mode" },
  { name: "plan", group: "model", hint: "plan first, act after approval" },
  { name: "view-plan", aliases: ["show-plan"], group: "model", hint: "show the current plan" },
  { name: "compact-mode", group: "model", hint: "toggle dense rendering" },

  // memory
  { name: "memory", aliases: ["mem"], group: "memory", hint: "browse memories" },
  { name: "remember", group: "memory", hint: "save a fact", argHint: "<fact>" },
  { name: "flush", group: "memory", hint: "write pending memories" },
  { name: "dream", group: "memory", hint: "consolidate memories" },

  // extensions
  { name: "skills", group: "extensions", hint: "manage skills" },
  { name: "create-skill", group: "extensions", hint: "scaffold a new skill" },
  { name: "plugins", group: "extensions", hint: "manage plugins" },
  { name: "marketplace", group: "extensions", hint: "browse the plugin marketplace" },
  { name: "hooks", group: "extensions", hint: "manage hooks" },
  { name: "mcps", group: "extensions", hint: "MCP server status" },

  // workflows & goals
  { name: "goal", group: "workflow", hint: "pursue an objective", argHint: "<objective>" },
  { name: "deep-research", group: "workflow", hint: "long-form research run" },
  { name: "workflow", group: "workflow", hint: "run a Rhai workflow" },
  { name: "workflows", group: "workflow", hint: "workflow run dashboard" },
  { name: "loop", group: "workflow", hint: "repeat on an interval", argHint: "[interval] <prompt>" },

  // agents
  { name: "agents", aliases: ["config-agents"], group: "agents", hint: "configure subagents" },
  { name: "personas", group: "agents", hint: "behavioral overlays for subagents" },
  { name: "dashboard", aliases: ["sessions"], group: "agents", hint: "multi-agent dashboard" },

  // media
  { name: "imagine", group: "media", hint: "generate an image", argHint: "<prompt>" },
  { name: "imagine-video", group: "media", hint: "generate a video", argHint: "<prompt>" },
  { name: "voice", group: "media", hint: "voice mode" },

  // account
  { name: "usage", aliases: ["cost"], group: "account", hint: "token + spend summary" },
  { name: "login", group: "account", hint: "authenticate" },
  { name: "logout", group: "account", hint: "sign out" },
  { name: "privacy", group: "account", hint: "data retention settings" },

  // ui
  { name: "theme", aliases: ["t"], group: "ui", hint: "pick a theme" },
  { name: "settings", aliases: ["config", "prefs"], group: "ui", hint: "open settings" },
  { name: "doctor", group: "ui", hint: "diagnose terminal + tooling" },
  { name: "docs", aliases: ["howto"], group: "ui", hint: "open documentation" },
  { name: "tutorial", aliases: ["tour"], group: "ui", hint: "guided tour" },
  { name: "feedback", group: "ui", hint: "send feedback" },
  { name: "btw", group: "ui", hint: "add an aside mid-turn" },

  // skills (user-invocable, scoped)
  { name: "local:commit", group: "skill", hint: "project skill: stage + commit" },
  { name: "user:review", group: "skill", hint: "personal skill: review the diff" },
];

export const GROUP_LABEL: Readonly<Record<CommandGroup, string>> = {
  session: "SESSION",
  model: "MODEL",
  memory: "MEMORY",
  extensions: "EXTENSIONS",
  workflow: "WORKFLOW",
  agents: "AGENTS",
  media: "MEDIA",
  account: "ACCOUNT",
  ui: "UI",
  skill: "SKILL",
};

/** repos the composer offers; the free-text field accepts anything else */
export const KNOWN_REPOS: readonly string[] = [
  "grok-build-app",
  "grok-build",
  "grokamp",
  "scratch",
];

export const EFFORT_TIERS: readonly string[] = ["low", "medium", "high", "xhigh"];

/** the token being completed, if the caret sits in a leading /command */
export function slashFragment(text: string, caret: number): string | null {
  const upto = text.slice(0, caret);
  const lineStart = upto.lastIndexOf("\n") + 1;
  const line = upto.slice(lineStart);
  if (!line.startsWith("/")) {
    return null;
  }
  const fragment = line.slice(1);
  return /\s/.test(fragment) ? null : fragment;
}

export function matchCommands(fragment: string, limit = 8): readonly SlashCommand[] {
  const needle = fragment.toLowerCase();
  if (needle.length === 0) {
    return SLASH_COMMANDS.slice(0, limit);
  }
  const scored: { command: SlashCommand; score: number }[] = [];
  for (const command of SLASH_COMMANDS) {
    const names = [command.name, ...(command.aliases ?? [])];
    let best = -1;
    for (const name of names) {
      const lower = name.toLowerCase();
      if (lower === needle) {
        best = Math.max(best, 3);
      } else if (lower.startsWith(needle)) {
        best = Math.max(best, 2);
      } else if (lower.includes(needle)) {
        best = Math.max(best, 1);
      }
    }
    if (best >= 0) {
      scored.push({ command, score: best });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name));
  return scored.slice(0, limit).map((s) => s.command);
}

/** replace the fragment under the caret with a chosen command */
export function applyCompletion(
  text: string,
  caret: number,
  command: SlashCommand,
): { readonly text: string; readonly caret: number } {
  const upto = text.slice(0, caret);
  const lineStart = upto.lastIndexOf("\n") + 1;
  const inserted = `/${command.name} `;
  const next = text.slice(0, lineStart) + inserted + text.slice(caret);
  return { text: next, caret: lineStart + inserted.length };
}

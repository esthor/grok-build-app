import type { TaskSpec } from "./protocol";

/** The demo "record crate": plausible coding-agent jobs queued like tracks. */
export const DEMO_TASKS: readonly TaskSpec[] = [
  {
    id: "t-01",
    title: "Fix flaky terminal resize test on macOS runner",
    repo: "grok-build",
    estOutputTokens: 9_400,
    plan: [
      "Reproduce flake with --repeat 50",
      "Bisect the race in pty resize handler",
      "Patch xai-tty-utils debounce",
      "Re-run suite until green",
    ],
  },
  {
    id: "t-02",
    title: "Add /skins slash command to the TUI",
    repo: "grok-build",
    estOutputTokens: 14_800,
    plan: [
      "Read pager command registry",
      "Wire new slash command + completion",
      "Theme picker modal state",
      "Snapshot tests for renderer",
    ],
  },
  {
    id: "t-03",
    title: "Speed up cold start by lazy-loading MCP servers",
    repo: "grok-build",
    estOutputTokens: 21_500,
    plan: [
      "Profile startup with tracing spans",
      "Defer MCP handshake until first use",
      "Add connecting state to statusline",
      "Benchmark before/after",
    ],
  },
  {
    id: "t-04",
    title: "Write ADR: session checkpoints on sqlite journal",
    repo: "grok-build",
    estOutputTokens: 6_200,
    plan: [
      "Survey xai-sqlite-journal API",
      "Draft ADR with alternatives",
      "Circulate for review",
    ],
  },
  {
    id: "t-05",
    title: "Port diff renderer to incremental hunk tracker",
    repo: "grok-build",
    estOutputTokens: 18_900,
    plan: [
      "Map current diff pipeline",
      "Adopt xai-hunk-tracker ranges",
      "Kill O(n^2) rescan",
      "Golden-file render tests",
    ],
  },
  {
    id: "t-06",
    title: "Teach sandbox to allow scoped git push",
    repo: "grok-build",
    estOutputTokens: 12_300,
    plan: [
      "Audit sandbox policy grammar",
      "Add remote allowlist rule",
      "Permission prompt copy pass",
      "Integration test in CI",
    ],
  },
  {
    id: "t-07",
    title: "Upgrade markdown tables to wrap in narrow panes",
    repo: "grok-build",
    estOutputTokens: 8_100,
    plan: [
      "Repro overflow in 80-col pane",
      "Implement column shrink pass",
      "Unicode width edge cases",
    ],
  },
  {
    id: "t-08",
    title: "Voice mode: push-to-talk hotkey on Linux",
    repo: "grok-build",
    estOutputTokens: 16_700,
    plan: [
      "Evaluate evdev capture options",
      "Hotkey config plumbing",
      "Latency budget measurements",
      "Docs + changelog entry",
    ],
  },
];

export const THINK_SNIPPETS: readonly string[] = [
  "Scanning the crate graph for the resize path... ",
  "The race is between SIGWINCH and the render tick. ",
  "I should check how webamp did this. Kidding. Mostly. ",
  "Two call sites mutate rows without the lock. ",
  "Plan: reproduce, bisect, patch, verify. Classic. ",
  "That test asserts on wall-clock time — suspicious. ",
  "Grepping for unguarded unwraps near the pty layer. ",
  "Cache line says no. Let me re-read the profiler dump. ",
  "The lockfile diff is noise; the real change is 3 lines. ",
  "Compaction kicked in; re-anchoring on the task plan. ",
];

export const TEXT_SNIPPETS: readonly string[] = [
  "Found it — the resize handler fires before the buffer swap. ",
  "Patching the debounce window from 8ms to one frame. ",
  "Tests green locally; pushing the branch for CI. ",
  "The registry needed one more entry for completions. ",
  "Startup drops from 410ms to 120ms with lazy MCP. ",
  "Wrote the ADR with three alternatives and a rollout plan. ",
  "Hunk tracker now reuses ranges across renders. ",
  "Sandbox rule added with an explicit remote allowlist. ",
  "Wrapped tables degrade gracefully at 60 columns. ",
  "Push-to-talk latency lands under 90ms on X11. ",
];

interface ToolTemplate {
  readonly tool: import("./protocol").ToolKind;
  readonly label: string;
  readonly ok: string;
  readonly risk: import("./protocol").RiskLevel;
}

export const TOOL_TEMPLATES: readonly ToolTemplate[] = [
  { tool: "terminal", label: "cargo check -p xai-grok-pager", ok: "0 errors, 2.1s", risk: 0 },
  { tool: "terminal", label: "cargo test -p xai-tty-utils -- resize", ok: "17 passed", risk: 0 },
  { tool: "terminal", label: "rg 'SIGWINCH' crates/", ok: "9 matches", risk: 0 },
  { tool: "file_read", label: "crates/codegen/xai-tty-utils/src/pty.rs", ok: "412 lines", risk: 0 },
  { tool: "file_edit", label: "pty.rs — debounce resize events", ok: "+14 -3", risk: 1 },
  { tool: "file_edit", label: "commands.rs — register /skins", ok: "+38 -1", risk: 1 },
  { tool: "search", label: "codebase graph: who calls resize()", ok: "6 callers", risk: 0 },
  { tool: "web", label: "docs.x.ai/build — MCP handshake", ok: "fetched 12kb", risk: 1 },
  { tool: "mcp", label: "sqlite-journal.query(checkpoints)", ok: "42 rows", risk: 0 },
  { tool: "subagent", label: "explorer: map diff render pipeline", ok: "report ready", risk: 0 },
  { tool: "terminal", label: "git push origin fix/pty-resize", ok: "pushed", risk: 2 },
  { tool: "terminal", label: "rm -rf target/tmp-bench", ok: "cleaned", risk: 2 },
];

export const MCP_SERVER_NAMES: readonly string[] = [
  "grok-tools",
  "browser",
  "sqlite-journal",
  "xai-docs",
  "mermaid",
];

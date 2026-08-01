// The grok-build built-in tool name surface, pinned upstream by test in
// crates/codegen/xai-grok-telemetry/src/external/schema.rs. MCP tools appear
// as `server__tool` (double underscore).

export const BUILTIN_TOOL_NAMES = [
  "read_file",
  "write",
  "search_replace",
  "edit_notebook",
  "delete_file",
  // Both spellings exist upstream; the live wire currently emits
  // run_terminal_command. Accept both.
  "run_terminal_cmd",
  "run_terminal_command",
  "get_task_output",
  "get_command_or_subagent_output",
  "get_terminal_command_output",
  "kill_task",
  "kill_command_or_subagent",
  "kill_terminal_command",
  "wait_commands_or_subagents",
  "grep",
  "glob",
  "list_dir",
  "skill",
  "ask_user_question",
  "enter_plan_mode",
  "exit_plan_mode",
  "todo_write",
  "task",
  "spawn_subagent",
  "web_search",
  "web_fetch",
  "lsp",
  "image_gen",
  "image_edit",
  "video_gen",
  "image_to_video",
  "reference_to_video",
  "monitor",
  "scheduler_create",
  "scheduler_delete",
  "scheduler_list",
  "search_tool",
  "use_tool",
  "update_goal",
] as const;

export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[number];

/** Split an MCP-qualified tool name (`server__tool`) into its parts, or null
 * for built-in names. */
export function splitMcpToolName(name: string): { server: string; tool: string } | null {
  const idx = name.indexOf("__");
  if (idx <= 0) return null;
  return { server: name.slice(0, idx), tool: name.slice(idx + 2) };
}

/**
 * The `x.ai/tool` metadata envelope attached to ACP tool_call updates
 * (crates/codegen/xai-grok-tools/src/tool_taxonomy.rs, JSON Schema vendored
 * at schema/tool_meta.schema.json). Consumer contract from upstream:
 * - `label` is the stable cross-harness grouping key; prefer it for joins
 * - `kind` is an OPEN set — tolerate unknown values (degrade to "other")
 * - `namespace` is closed upstream but read it as a loose string out-of-tree
 * - `input` is a projection; bulky fields are never projected — read rawInput
 */
export type CanonicalToolMeta = {
  version: number;
  name: string;
  kind: string;
  namespace: string;
  label: string;
  read_only: boolean;
  input?: unknown;
};

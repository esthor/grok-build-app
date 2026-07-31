# @grok-build-app/grok-harness

**The single source of truth for grok-build CLI session interfaces** used by
every app in this repo.

**Full field-level map:** [REFERENCE.md](./REFERENCE.md) — every disk path,
events.jsonl type, updates.jsonl kind, leader message, hook event, tool name,
and `x.ai/*` method, generated from grok-build `SOURCE_REV`. If an app monitors or drives `grok` sessions, the
types, parsers, and constants for those surfaces live here — not inlined in
the app.

Zero runtime dependencies (library), pure erasable TypeScript, runtime-agnostic
(IO is injected where needed).

```sh
cd packages/grok-harness
bun install && bun run check
bun run verify   # replay every local ~/.grok session through the parsers
# regenerate REFERENCE.md from a local grok-build checkout:
#   GROK_BUILD_SRC=~/dev/tools/grok-build bun run reference
```

```ts
import {
  Tail, parseEventLine, parseSummary, parseUpdateLine,
  HOOK_EVENT_NAMES, KNOWN_UPDATE_KINDS, frameLeaderMessage,
} from "../../packages/grok-harness/src/index.ts";
```

## Surface map

| Module | What it owns |
|---|---|
| `paths` | `$GROK_HOME`, session file names, cwd encode/decode, long-path `.cwd` marker, session-id validation |
| `events` | Full `events.jsonl` vocabulary (~57 types): turns, phases, tools, permissions, MCP, goal/todo/laziness orchestration |
| `updates` | Full `updates.jsonl` ACP + xAI `sessionUpdate` kinds (~50), usage/cost, tool meta, subagent/task/hook/scheduler accessors |
| `state-files` | `active_sessions.json`, `summary.json`, `signals.json`, `hunk_records.jsonl` |
| `tail` | Byte-offset JSONL tailer (short-read + UTF-8 safe), injected `TailIo` |
| `leader` | Socket framing, register/ready, control commands, roster parse |
| `headless` | `grok -p` streaming-json NDJSON + final json result |
| `tools` | Built-in tool names + `CanonicalToolMeta`; vendored JSON Schema |
| `hooks` | Hook event names (with aliases), config map parser |
| `methods` | ACP + `x.ai/*` method name constants |

## Semantics you will get wrong without reading this

- **Two incompatible `inputTokens` conventions.** updates.jsonl
  `turn_completed.usage.inputTokens` INCLUDES cache reads; headless
  `usage.input_tokens` EXCLUDES them. Never sum across surfaces.
- **Cost is fail-closed.** Use `effectiveCostUsdTicks(usage)` — absent or
  incomplete/partial means UNKNOWN, never $0.
- **`_meta.totalTokens` is context occupancy**, not spend; drops on compaction.
- **`signals.json` can lag hours** — seed slow values only; fold JSONL for live counters.
- **`phase_changed` dominates events.jsonl** (~90%+). Debounce.
- **Subagent sessions** have `session_kind` starting with `"subagent"`; decide whether to surface them.
- **Both `run_terminal_cmd` and `run_terminal_command` exist** upstream.
- **Roster notifications** may use `_x.ai/sessions/changed` (underscore prefix).
- **Small state files are atomically replaced** (new inode); JSONL can tear the final line.

## Provenance

Modeled from grok-build (`xai-file-utils` events, `xai-grok-shell`
storage/leader/roster/hooks notifications, `xai-grok-pager` headless,
`xai-grok-tools` taxonomy, `xai-grok-hooks`) and verified against live
`~/.grok` data. Source pin: `SOURCE_REV 8d69c91f02bcacf01e98d5aebbf2f92547c45738`.
`schema/tool_meta.schema.json` is vendored verbatim from that rev.

These are UNOFFICIAL mirrors of interfaces that can change: when grok-build
ships a change, update this package first and let apps inherit it.
`bun run verify` is the drift detector.

## Consumers

- `apps/grokmeter` — disk-surface tailing
- `apps/grokamp` — leader module is the real-transport vocabulary

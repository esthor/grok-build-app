# @grok-build-app/grok-harness

**The single source of truth for grok-build CLI session interfaces** used by
every app in this repo. If an app monitors or drives `grok` sessions, the
types, parsers, and constants for those surfaces live here — not inlined in
the app.

Zero runtime dependencies, pure erasable TypeScript, runtime-agnostic (IO is
injected where needed, so Bun servers, Vite frontends, and Tauri shells can
all consume it).

```sh
cd packages/grok-harness
bun install && bun run check
```

Consume by relative import (each app keeps its own toolchain; there is no
root workspace by design):

```ts
import { Tail, parseEventLine, parseSummary } from "../../packages/grok-harness/src/index.ts";
```

## The four interface surfaces

### 1. Session files on disk (`src/paths.ts`, `events.ts`, `updates.ts`, `state-files.ts`, `tail.ts`)

Passive monitoring — no cooperation from the grok process required:

| Path (under `$GROK_HOME`, default `~/.grok`) | Module | What it is |
|---|---|---|
| `active_sessions.json` | `state-files` | live TUI sessions (pid, cwd) — verify pid liveness, crash leaves stale entries |
| `sessions/<enc-cwd>/<id>/summary.json` | `state-files` | identity: title, model, git head, timestamps, session kind |
| `…/signals.json` | `state-files` | cumulative counters — **can lag hours**; seed slow values only |
| `…/events.jsonl` (append-only) | `events` | telemetry log: turns, phases, tool durations/outcomes, permission decisions + waits, TTFT via `first_token` |
| `…/updates.jsonl` (append-only) | `updates` | authoritative ACP transcript: message/thought chunks, tool calls with `rawInput` + `x.ai/tool` meta, `turn_completed` usage, running context estimate in `_meta.totalTokens` |
| `…/hunk_records.jsonl` (append-only) | `state-files` | per-hunk line attribution (keep latest record per `hunkId`) |

`Tail` implements the reader contract for the append-only files: byte-offset
resume, torn-final-line buffering, skip-unparseable, truncation reset.

### 2. Leader socket (`src/leader.ts`)

Push-based monitoring and control: Unix socket at `$GROK_HOME/leader.sock`,
u32 big-endian length-prefixed JSON frames (`frameLeaderMessage` /
`LeaderDeframer`). Register, wait for `leader_ready`, then speak ACP. The
multi-session roster rides `x.ai/sessions/list` + `x.ai/sessions/changed`.
This is the intended seam for grokamp's real transport and any fleet view.

### 3. Headless output (`src/headless.ts`)

`grok -p --output-format streaming-json` NDJSON events and the final
`--output-format json` result object, for apps that spawn runs.

### 4. Tool taxonomy (`src/tools.ts`, `schema/tool_meta.schema.json`)

Built-in tool names (pinned upstream by test) and the `x.ai/tool` metadata
envelope. The vendored JSON Schema is the upstream artifact — regenerate
types from it if you need more than the `CanonicalToolMeta` mirror.

## Semantics you will get wrong without reading this

- **Two incompatible `inputTokens` conventions.** `updates.jsonl`
  `turn_completed.usage.inputTokens` INCLUDES cache reads; headless
  `usage.input_tokens` EXCLUDES them. Never sum across surfaces.
- **Cost is fail-closed.** `costUsdTicks` (1e10 ticks = $1) absent, or
  `usageIsIncomplete`/`costIsPartial` set, means UNKNOWN — never render $0.
- **`_meta.totalTokens` is context occupancy, not spend.** It is the
  harness's own bytes/4 estimate of the current conversation, and it drops
  on compaction. Ratchet it yourself if you want an odometer.
- **`signals.json` goes stale mid-session** (observed hours behind). Fold
  the JSONL streams for anything that moves.
- **`phase_changed` dominates events.jsonl** (~90%+ of lines). Debounce.
- **Subagent sessions are hidden by default** (`session_kind` starting with
  `"subagent"`); decide explicitly whether to surface them.
- **Both `run_terminal_cmd` and `run_terminal_command` exist** upstream;
  the live wire currently emits the latter. MCP tools are `server__tool`.
- **Small state files are atomically replaced** — watchers must re-open by
  path (new inode); JSONL appends can tear the final line — skip and go on.

## Provenance

Modeled from the grok-build source tree (`xai-file-utils` events,
`xai-grok-shell` storage/leader/roster, `xai-grok-pager` headless,
`xai-grok-tools` taxonomy) and verified against live `~/.grok` session data
on 2026-07-29. Source monorepo rev at time of modeling:
`2a818575225183d8ca915f5632a09b8067b5156a` (grok-build `SOURCE_REV`);
`schema/tool_meta.schema.json` is vendored verbatim from
`crates/codegen/xai-grok-tools/schema/tool_meta.schema.json` at that rev.
These are UNOFFICIAL mirrors of undocumented interfaces: when grok-build
ships a change, update this package first and let the apps inherit it.

## Consumers

- `apps/grokmeter` — disk-surface tailing (collector `src/collectors/grok.ts`).
- `apps/grokamp` — pending: its `src/agent/protocol.ts` documents the
  adapter seam ("translate grok-build's ACP messages"); the leader module
  here is that transport's vocabulary.

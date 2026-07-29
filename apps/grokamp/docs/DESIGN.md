# DESIGN — mapping Winamp onto a coding-agent harness

Grokamp's thesis: **a coding agent session has the same shape as a music
player session.** Something long-running streams; you watch meters instead of
staring at text; you queue up more; occasionally the deck demands your
attention. Winamp solved the ergonomics and the *joy* of that in 1997.

The mapping is grounded in two research passes:
[WINAMP.md](./WINAMP.md) for the player, and a source dive through
grok-build's actual surfaces — its ACP agent (`crates/codegen/xai-acp-lib`,
`xai-grok-shell`), permission prompter (`xai-grok-workspace/src/permission`),
headless NDJSON emitter (`xai-grok-pager/src/headless.rs`), theming
(`docs/user-guide/06-theming.md`), and the Agent Dashboard
(`23-dashboard.md`).

## The core metaphor table

| Winamp | Grokamp | grok-build reality it fronts |
|---|---|---|
| Track | Task / session | `session/new` + `session/prompt` |
| Playlist editor | **Task Queue** window | prompt queue (`Ctrl+;`), `/dashboard` rows |
| Play / pause / stop | Run / pause / abort | `session/prompt`, `session/cancel` |
| Prev / next track | Jump between queued tasks | dashboard agent switching |
| Track time (mm:ss, click = remaining) | Session elapsed; click = est. remaining (tokens ÷ tok/s) | `TurnCompleted.usage`, elapsed |
| kbps readout | **TOK/S** (output tokens/sec) | streamed delta cadence |
| kHz readout | **%CTX** (context window fill) | `/context`, `AutoCompactStarted.percentage` |
| Mono/Stereo lamps | **MCP / SUB / PERM** LEDs | MCP server state, `SubagentSpawned/Finished`, `PendingInteraction` |
| Position bar | Est. progress through task | outputTokens / estimate |
| Volume slider | **THR** throttle (demo: stream speed) | effort/rate knobs |
| Balance slider (center detent) | **RISK** — paranoid ⟷ YOLO | permission modes: `default` → `acceptEdits` → `bypassPermissions` (Shift+Tab cycle, `--yolo`) |
| Song ticker | Marquee: task title + live tool call + `*** WAITING FOR APPROVAL` | `tool_call` updates, `PendingInteraction` |
| Visualizer (spectrum/scope) | Token-flow spectrum; tool calls kick the bass, permission prompts spike the highs | the event stream itself |
| EQ window (10 bands + preamp, ON/AUTO, presets) | **Harness Tuner**: EFFORT preamp + TMP/PLN/CTX/PAR/TST/WEB/MEM/VRB/SFT/FUN bands, presets like "Deep Research", "YOLO Friday", "Prod Incident" | `/effort` tiers, model params, agent profiles; AUTO ≈ per-task profiles |
| Playlist ADD/REM/SEL/MISC | Same buttons on the Queue | queue edit (`x.ai/queue/*`) |
| Double-click titlebar → windowshade | Same | — |
| Skins (.wsz) | **JSON skins** + Skin Lab | grok-build's 5 named TUI themes + full color-slot theming |
| DEMO.MP3 | The scripted demo agent | `SimTransport` |

## The plugin taxonomy mapping

Winamp's plugin prefixes were the API. They map one-to-one onto harness
extension points:

| Winamp prefix | What it did | Harness equivalent |
|---|---|---|
| `in_` (input) | decode any format | **model providers / transports** (ACP stdio, WebSocket relay, leader socket, headless NDJSON) |
| `out_` (output) | route audio anywhere | **frontends**: TUI, IDE extension, this GUI, `--output-format json` |
| `dsp_` (effects) | transform mid-stream | **hooks** (15 events, PreToolUse can block — literally a DSP on the tool stream) |
| `vis_` | visualize the signal | **visualizers / statuslines** (our spectrum, their `◎ 1 command · 2 monitors` line) |
| `gen_` (general) | arbitrary UI | **MCP servers & skills** (arbitrary capability, namespaced `server__tool`) |
| `ml_` (library) | organize the collection | **session store** (`~/.grok/sessions/`, FTS5 search, `/resume`) |
| SHOUTcast | broadcast your stream | session sharing / `x.ai/share_session` |

## The event protocol (and how to wire the real thing)

The UI consumes one interface — `AgentTransport` in
[`src/agent/protocol.ts`](../src/agent/protocol.ts) — implemented today by
the seeded simulator (`SimTransport`). Every event was chosen to have a
1:1-ish counterpart in grok-build's ACP surface, so a real adapter is a
translation layer, not a redesign:

| Grokamp `AgentEvent` | grok-build ACP counterpart |
|---|---|
| `session_started` | `session/new` → first `session/update` |
| `thinking_delta` | `agent_thought_chunk` |
| `text_delta` | `agent_message_chunk` |
| `tool_call_started/finished` | `tool_call` / `tool_call_update` (status `pending/in_progress/completed/failed`; icons from the rich `acp::ToolKind` enum) |
| `permission_requested(blocking)` | `session/request_permission` (+ `PendingInteraction` badge) |
| `permission_resolved(decision, auto)` | `RequestPermissionOutcome::Selected(option_id)`; auto ≈ policy stages 2–4 |
| `todos_updated` | `plan` session update / todo_write |
| `usage_updated` | `TurnCompleted.usage: PromptUsage` (beware: `costUsdTicks` is scrubbed when partial — absence means *unknown*, never free) |
| `session_finished` | `TurnCompleted.stop_reason` (durable) |

Adapter sketch: spawn `grok agent stdio`, send `initialize`
(`clientIdentifier: "grok-pager"`-class gets the rich permission option
rows), `session/new`, then translate the two notification rails into
`AgentEvent`s; on reattach, replay via `x.ai/session/updates` with a negative
offset and dedup on `_meta.eventId`.

The **RISK slider** is the honest UI for what harnesses bury in flags: at
-100 every mutating tool asks (the run *parks*, exactly like the real
`PendingInteraction` flow); at +100 only nothing auto-allows… everything
does. The sim's dangerous-tool tier (git push, rm -rf) mirrors grok-build's
always-reprompt list (`rm, chmod, kill, git push, …`).

## What the harness experience taught the UI

Built inside one coding-agent harness (Claude Code) while reading another
(grok-build), these are the load-bearing UX facts the tiles encode:

1. **The stream is the show** — thinking vs. text vs. tool lines need
   distinct typography (Terminal tile), but most of the time you only need
   the *pulse* (visualizer, TOK/S).
2. **Blocking permissions are the emotional peak** — they stop the world.
   Grokamp makes them physical: playstate ⚿, amber PERM LED, marquee
   `*** WAITING FOR APPROVAL`, high-frequency spectrum jitter, inline
   ALLOW/DENY card.
3. **Queueing is native** — you always have three more asks than the agent
   has hands. Playlist ergonomics (reorder, shuffle, repeat, double-click to
   jump) fit perfectly.
4. **Todos are the setlist** — the agent's plan, glanceable, with the
   in-progress item blinking.
5. **Context is the tank meter** — %CTX creeping up is the "song ending"
   feeling; compaction is the DJ crossfade.
6. **Personality is retention** — skins, easter eggs, LED ghosts. People
   kept Winamp for 15 years because it felt like theirs.

## Stack

bun + Vite + React 19, TypeScript at maximum strictness
(`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `skipLibCheck:
false` for app code, every `noImplicit*`/`noUnused*` flag). TanStack:
**Router** (the workspace is deep-linkable: `?skin=…&wins=…&x2=1`),
**Store** (windows/settings/session/queue), **Virtual** (queue +
terminal scrollback), **Query** (the fake library scan; later, session
lists over ACP).

**Desktop shell: Tauri v2** (`src-tauri/`), chosen over Electron as the
"better perf option": ~10MB binaries vs ~200MB, native webview instead of a
bundled Chromium, single-digit-ms IPC, and — decisive here — **Rust**, the
language of grok-build itself (a future adapter can
spawn/manage `grok agent stdio` from the shell process). The web build stays
first-class: everything runs in a plain browser via `bun run dev`.

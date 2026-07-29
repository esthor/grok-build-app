# GROKMETER

**A Rainmeter-inspired desktop telemetry deck for [Grok Build](https://x.ai/cli).**
Glowing widgets, arc gauges, a tool radar, and a live event stream — mission
control for your coding agent, styled like the future we were promised in
2003. Runs on Bun with zero runtime dependencies and the strictest tsconfig
TypeScript will let you write.

```sh
cd apps/grokmeter
bun install        # dev-time typecheck deps only (typescript, @types/bun)
bun run dev        # live deck  → tails your real ~/.grok sessions
bun run demo       # demo deck  → scripted agent mission + synthetic system stats
bun run check      # tsc, strictest settings, both server & browser configs
```

Open http://localhost:4517 and leave it on a monitor.

---

## Why Rainmeter?

Rainmeter (2001–today) let people turn a Windows desktop into a personal
mission control: CPU arcs, network graphs, now-playing bars, weather, notes —
free-floating translucent widgets, draggable anywhere, glanceable forever.
The famous suites (illustro, Enigma, JARVIS/S.H.I.E.L.D. OS, TRON) chased the
same fantasy sci-fi FUI designers were selling in *Minority Report* and
*Iron Man*: **your computer as an instrument panel, you as its operator.**

A coding agent deserves the same treatment. Instead of decorative "fuigetry",
every gauge here reads real telemetry from a real agent harness:

| Rainmeter concept | grokmeter equivalent |
|---|---|
| **Measures** (data sources) | `src/collectors/` — system stats, `~/.grok` session tail, now-playing |
| **Meters** (visual renderers) | `src/web/widgets/` — 17 panels bound to the shared store |
| **Skins** | themes: `HUD://CYAN`, `GRID://EMBER`, `NET://MATRIX`, `MONO://GHOST` |
| **Layouts** | drag widgets in edit mode; positions persist locally |
| **Update cycle** | 1 s collector tick, 60 fps decorative motion |

Design rules borrowed from two decades of skin culture: corner-bracket
frames instead of boxes, Roundline-style 270° arc gauges with degree ticks,
counter-rotating decorative rings, segmented LED bars, 9 px letterspaced
ALL-CAPS microlabels, thin oversized numerals, one dominant hue plus amber
for alerts — and **honest data, decorative motion: never fake the numbers.**

## The widget fleet

**Agent harness** (the star of the show)

- `AGENT // STATUS` — live phase readout: REASONING / RESPONDING / EXECUTING
  TOOL / PERMISSION HOLD, with model, turn count, phase hold time
- `AGENT // EVENT STREAM` — the heartbeat: tool calls with input detail,
  thoughts, messages, permission requests/decisions, edits, turn markers
- `CONTEXT // WINDOW` — arc gauge of context occupancy (tokens vs window)
- `TOOLS // RADAR` — polar plot of per-tool call volume, sweep + pings
- `TOKENS // FLOW` — cumulative token odometer + tokens/sec trace
- `LATENCY // PROFILE` — TTFT avg/min/max (folded live from `first_token`
  events) + inter-token latency percentiles
- `DIFF // TAPE` — agent line churn (+/−), files touched, recent hunks
- `PERMISSIONS // GATE` — approval telemetry + klaxon band while the agent
  is holding for a human
- `MISSION // SESSION` — session title, cwd, branch@commit, sandbox, effort

**Classic Rainmeter fare**

- `CLOCK // LOCAL`, `CPU // CORES` (per-core bars in demo; honest LED total
  bar + history on macOS live, where per-core needs privileges),
  `MEMORY // PRESSURE` arc, `NETWORK // LINK` twin rx/tx traces,
  `DISK // ROOT`, `PROCESSES // TOP`, `NOW PLAYING` (Spotify/Music via
  AppleScript) and `SYSTEM // INFO`.

## Live mode: how it reads your agent

No cooperation from the `grok` process required — the deck tails what the
harness already writes under `~/.grok` (append-only JSONL + atomically
replaced state files):

```text
active_sessions.json            which sessions are alive (pid, cwd)
sessions/<cwd>/<id>/
  summary.json                  title, model, git head, timestamps
  signals.json                  context window size, ITL percentiles
  events.jsonl        (tail)    phases, tool durations, permission waits, turns
  updates.jsonl       (tail)    ACP stream: tool rawInput, message text, token counter
  hunk_records.jsonl  (tail)    per-hunk agent line attribution
```

The tailer resumes from byte offsets, tolerates torn final lines (the
harness heals them on next append), re-stats atomically-replaced files by
path, and rebuilds counters by replaying the event log on attach. It prefers
the live session with the freshest event file, and falls back to the most
recently active session on disk (shown as non-live) when nothing is running.
Demo mode emits the exact same wire protocol, so the UI cannot tell the
difference — that's the measures/meters split doing its job.

## Controls

| Key / UI | Action |
|---|---|
| `E` / `LOCKED` button | toggle edit mode (drag widgets, 8 px snap) |
| `T` / theme button | cycle `HUD://CYAN → GRID://EMBER → NET://MATRIX → MONO://GHOST` |
| `R` | reset layout to the packed default |

Layout and theme persist in `localStorage`.

## Strictness

Two tsconfigs (server: Bun types, no DOM; web: DOM, no Bun globals) extend a
base with every strictness flag on — `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
`noImplicitOverride`, `noUncheckedSideEffectImports`, `noImplicitReturns`,
`noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`,
`allowUnreachableCode/UnusedLabels: false`, and `skipLibCheck: false`.
`erasableSyntaxOnly` guarantees the sources stay directly runnable by Bun's
type-stripping loader (no enums, no namespaces, no parameter properties).
`isolatedDeclarations` is deliberately omitted: it requires declaration
emit, and nothing here publishes types.

Zero runtime dependencies: Bun's fullstack server bundles the frontend from
`index.html`; the only `devDependencies` are `typescript` and `@types/bun`.

## Ideas for v2

- Subscribe to `~/.grok/leader.sock` as an ACP client for push updates and
  the multi-session roster (`x.ai/sessions/changed`) — a fleet view.
- HTTP hook (`~/.grok/hooks/*.json`) → zero-parse push events.
- Widget variants + a shareable layout format (the `.rmskin` growth loop).
- Weather (open-meteo), RSS, and a honeycomb launcher, for the full ricing
  experience.

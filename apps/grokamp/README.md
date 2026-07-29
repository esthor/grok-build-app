# GROKAMP

**A Winamp-shaped frontend for [Grok Build](https://x.ai/cli), xAI's terminal coding agent.**
It really whips the token stream.

The playlist is a task queue. The EQ tunes the harness. The visualizer eats
tokens. Permission prompts stop the deck like a skipping CD. And the whole
thing rewears itself from a single JSON skin file, because the wild diversity
of skins — and the ease of making them — is what made Winamp *Winamp*.

```
┌ GROKAMP ───────────────────────┐  ┌ TERMINAL ──────────────────────┐
│ ⚿ 04:25  FIX FLAKY RESIZE ***  │  │ > found it — the resize handler │
│ 032 TOK/S  09 %CTX  $0.07      │  │ ≡ crates/xai-tty-utils/pty.rs   │
│ ▂▄▆█▅▃▂  MCP● SUB○ PERM●       │  │ ⚿ APPROVAL NEEDED     [SPICY]   │
│ THR ──▮── RISK ──▮── TUN QUE…  │  │ git push origin fix/pty-resize  │
│ ⏮ ▶ ⏸ ■ ⏭  ⏏   SHUF REP        │  │ [ALLOW] [DENY]                  │
└────────────────────────────────┘  └────────────────────────────────┘
```

## Run it

```sh
cd apps/grokamp
bun install
bun run dev          # http://localhost:5177
```

A scripted demo agent (grok-build cosplay, seeded per task) drives the whole
UI. Press **▶**. Gates:

```sh
bun test             # 28 tests: snap math, skin parsing, sim engine
bun run typecheck    # strictest tsconfig that exists
bun run build        # production bundle (~126 kB gzip)
```

Desktop shell (Tauri v2 — `cargo check`s clean; needs a Rust toolchain):

```sh
bun run tauri dev
```

## The windows

| window | winamp ancestor | what it does |
|---|---|---|
| **GROKAMP** (main) | main window | transport, 7-seg session clock (click = est. remaining), marquee with live tool call, TOK/S + %CTX + cost readouts, MCP/SUB/PERM LEDs, mini visualizer, THR + RISK sliders, clutterbar O-A-I-D-V |
| **HARNESS TUNER** | equalizer | EFFORT preamp + 10 bands (TMP PLN CTX PAR TST WEB MEM VRB SFT FUN), ON/AUTO, presets: Pair Prog, Deep Research, YOLO Friday, Prod Incident… |
| **TASK QUEUE** | playlist editor | virtualized queue, ADD/REM/SEL/MISC, shuffle/repeat, double-click to run, ~token "durations" |
| **TERMINAL** | — (the 2025 part) | streaming thinking/text/tool log, inline blocking **ALLOW/DENY** permission cards |
| **VISUALIZER** | vis window | spectrum (19 bars + falling peak caps) / oscilloscope / plasma, fed by token flow — tool calls kick the bass |
| **TODO LIST** | — | the agent's live plan; in-progress blinks |
| **MCP SERVERS** | plugins | server rack with status LEDs |
| **SKIN LAB** | skin picker + MS Paint | live recolor, APPLY/EXPORT/IMPORT/RANDOM |

Windows drag, **snap at the classic 10px** (20 at our 2× pixel grid),
double-click titlebars to **windowshade**, and the resizable ones quantize to
Winamp's 25×29 segments. Layout, skin, and double-size state persist — and
live in the URL (`?skin=Vaporwave%20Sunset&wins=main,queue&x2=1`), so a
workspace is a link.

## Keys

`Z X C V B` prev/play/pause/stop/next (the sacred row) · `S` shuffle ·
`R` repeat · `L` eject/queue a task · `Ctrl+D` double size · `Alt+1..8`
toggle windows · **type `llama`** for the tribute (yes, the l's queue tasks;
the original NULLSOFT egg had the same hazard — that's why it was
N-U-L-Esc-L-Esc-S-O-F-T. Lore-accurate. Not a bug.)

## Docs

- [docs/WINAMP.md](docs/WINAMP.md) — the research: what made Winamp Winamp,
  verified against the Webamp source and the Skin Museum.
- [docs/DESIGN.md](docs/DESIGN.md) — the mapping: player anatomy → harness
  anatomy, grounded in grok-build's real ACP/permission/theming surfaces,
  including the `AgentEvent` ↔ ACP translation table for wiring the real
  agent.
- [docs/SKINNING.md](docs/SKINNING.md) — make a skin in five minutes.

## Stack & stance

- **bun** everywhere (install, test, scripts). **Vite + React 19.**
- **TanStack** Router (URL-encoded workspace), Store (all state), Virtual
  (queue + scrollback), Query (async library scan → later, ACP session
  lists).
- **Strictest possible tsconfig**: `strict` plus `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, all
  `noUnused*`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, and
  `skipLibCheck: false` for app code (the test config concedes lib-checking
  because `bun-types` itself doesn't pass it).
- **Tauri v2 over Electron** for the shell: ~10 MB vs ~200 MB, native webview,
  and Rust — the language of grok-build itself, so the future
  `grok agent stdio` adapter can live in-process. The browser build remains
  first-class.
- **No UI framework, no component library.** The chrome is hand-bevelled CSS
  on skin-token custom properties. Winamp didn't use Bootstrap.

## Wiring the real grok-build (next)

`src/agent/protocol.ts` defines the `AgentTransport` interface; the demo
`SimTransport` implements it. The real one speaks ACP over
`grok agent stdio` — the event mapping table and adapter sketch are in
[docs/DESIGN.md](docs/DESIGN.md#the-event-protocol-and-how-to-wire-the-real-thing).
Nothing in the tiles changes.

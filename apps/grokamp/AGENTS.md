# Grokamp — agent contract

Winamp-inspired frontend for Grok Build. Self-contained: run every command
from this directory.

## Commands

```sh
bun install        # deps (bun.lock is authoritative)
bun run dev        # vite dev server, http://localhost:5177 (strict port)
bun test           # snap math, skin parsing, sim engine
bun run typecheck  # both tsconfigs; the app config is the strict one
bun run build      # typecheck + production bundle to dist/
bun run tauri dev  # desktop shell (Tauri v2; needs a Rust toolchain)
```

## Contracts

- `src/agent/protocol.ts` is the UI ↔ agent boundary. The demo
  `SimTransport` (`src/agent/engine.ts`) implements it; a real grok-build
  adapter must too (mapping table: `docs/DESIGN.md`). Tiles never import the
  engine directly — only `src/agent/controller.ts` verbs.
- Skins are data, never code. Loaders must go through `parseSkin`
  (`src/skins/runtime.ts`). The 24-slot `vis` palette follows the
  `viscolor.txt` mapping documented in `docs/SKINNING.md`.
- `tsconfig.json` strictness is load-bearing; do not relax flags to land a
  change. `tsconfig.test.json` documents its two deliberate concessions.
- Winamp fidelity numbers (10px snap → 20 at 2×, 25×29 resize segments →
  50×58, 19 spectrum bars, 220ms marquee steps) are researched, not
  arbitrary — see `docs/WINAMP.md` before "fixing" them.

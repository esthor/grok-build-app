# grok-harness — agent contract

This package is the repo's single source of truth for grok-build CLI
session interfaces. Rules:

- Zero runtime dependencies, no DOM/Bun/Node type assumptions — IO is
  injected (`TailIo`, `PathJoin`). It must stay consumable from a Bun
  server, a Vite frontend, and a Tauri shell alike.
- Apps model their own view-state; THIS package models grok's surfaces.
  If you find grok interface knowledge inlined in an app, move it here.
- Parsers never throw on foreign input; torn/corrupt lines return null.
- Every schema addition needs provenance: the upstream source file and the
  grok-build `SOURCE_REV` it was modeled from (see README § Provenance).
- `bun run check` (from this directory) is the gate.

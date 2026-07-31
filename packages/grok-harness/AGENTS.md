# grok-harness — agent contract

This package is the **single source of truth** for grok-build CLI session
interfaces in this repository.

## Rules

- Put all grok interface knowledge here (disk session files, events, updates,
  leader socket, headless output, tools, hooks, ACP/x.ai methods).
- If you find grok interface knowledge inlined in an app, move it here.
- Keep zero runtime dependencies; inject IO (`TailIo`, path join, readFile).
- After changing parsers, run `bun run check` and `bun run verify`.
- When grok-build changes wire shapes, update this package first.

## Modules

`paths`, `events`, `updates`, `state-files`, `tail`, `leader`, `headless`,
`tools`, `hooks`, `methods`, `json`.

## Full reference

- `REFERENCE.md` is the end-to-end field map of every grok-build interface.
- After a grok-build upgrade: regenerate it (`bun run reference` with
  `GROK_BUILD_SRC` set), then fix package parsers until `bun run verify` is clean.

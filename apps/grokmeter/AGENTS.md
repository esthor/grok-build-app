# Grokmeter — agent contract

Bun app, zero runtime dependencies, no framework, no build step beyond Bun's
fullstack server. All commands run from `apps/grokmeter/`:

- `bun install` — dev-time typecheck deps only (`typescript`, `@types/bun`).
- `bun run check` — the gate. Two tsconfigs (server: Bun types, no DOM;
  web: DOM, no Bun globals) with every strictness flag on, including
  `skipLibCheck: false` and `erasableSyntaxOnly` (no enums, no namespaces,
  no parameter properties — sources must stay Bun-strippable).
- `bun run dev` (live, tails `~/.grok`) / `bun run demo` (scripted data),
  port 4517 or `PORT`.
- `bun test` — unit regressions for pure logic (feed reconciliation);
  `bun run check` runs it after the typechecks.

Contracts to preserve:

- Collectors ("measures") and widgets ("meters") only communicate through
  `src/shared/protocol.ts`. Demo and live emit the same wire types; the UI
  must not be able to tell which is which.
- Grok interface knowledge (session file schemas, parsers, tailing) comes
  from `packages/grok-harness` — never inline it here.
- Honest data, decorative motion: animation is fine, fabricated numbers are
  not. If a stat is unavailable, show its absence (see the live CPU
  per-core fallback).
- Live collectors tail files other processes own: tolerate torn final
  lines, re-stat atomically replaced files by path, never throw on parse.

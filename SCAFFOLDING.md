# Operator App Scaffolding

Shared substrate for building many wildly different UIs for grok-build operators.
The apps are re-imaginings (Winamp deck, Rainmeter dashboard, whatever comes next);
the plumbing underneath them is always the same four jobs:

1. **Find** grok sessions (live and historical)
2. **Stream** what an agent is doing (events → state)
3. **Act** on it (prompt, approve, steer, fork, rewind)
4. **Tell the truth** — real sessions only. Real numbers or an honest
   "unknown". **Synthetic/demo data is banned outright**: no sim transports,
   no demo modes, nothing that renders a session that never happened.

**This document is the source of truth for this repository's shared
architecture.** Where it conflicts with earlier repo guidance (e.g. "keep the
root toolchain-free / add shared infrastructure only after apps prove the
need"), this document wins: two shipped apps *are* that proof. In-flight work
(grok-harness #7, reference #9, imports #5/#6, fleet #8) is welcome ground
cover, but it is **audited against this document** — never the reverse.

Everything here is grounded in three deep dissections done on 2026-07-31:
grok-build's actual integration surfaces (the `xai-org/grok-build` public tree,
v0.2.117, verified against a live `~/.grok`), grokamp
(`claude/winamp-ui-grok-build-b14f60` → imported here via PR #6), and grokmeter
(`claude/rainmeter-ui-grok-build-c50558` → imported via PR #5). The
`xai-org/grok-build` clone is **read-only recon** — we spelunk it for ground
truth; no work lands there.

---

## 1. Ground truth: how an external app can talk to grok-build

| # | Surface | Invoke | Direction | Use for |
|---|---------|--------|-----------|---------|
| 1 | **ACP over stdio** | `grok agent [--leader] stdio` | bidirectional | desktop apps that spawn processes. `--leader` joins the shared per-machine leader → session sharing with the TUI and other clients for free |
| 2 | **ACP over WebSocket** | `grok agent serve --bind 127.0.0.1:2419 --secret <tok>` → `ws://host/ws` | bidirectional | web + mobile (Expo). Browser auth via `?server-key=`; agent state survives reconnects |
| 3 | **ACP via relay** | `grok agent headless --grok-ws-url wss://relay/ws` | bidirectional | internet-reachable mobile/remote apps |
| 4 | **Headless one-shots** | `grok -p … --output-format streaming-json \| streaming-messages-json` | read-only | CI, batch, one-shot panels. `streaming-messages-json` is Claude-Code `stream-json` compatible |
| 5 | **`~/.grok` observation** | tail/poll files, zero cooperation | read-only | dashboards, history browsers, ambient meters (grokmeter's path) |
| 6 | **External OTel** | `GROK_EXTERNAL_OTEL=1` + OTLP exporter | read-only | fleet metrics (versioned `v1` schema) |
| 7 | **Notification hooks** | `[[ui.notifications.hooks]]` in config.toml | push | zero-code "poke my app" (turn_complete, approval_required, …) |

**Key facts to build on:**

- ACP library: `agent-client-protocol` **0.10.4** (Rust), wire `ProtocolVersion::V1`.
  Official SDKs: TS, Rust, Python, Go, Kotlin. **No Swift SDK — we own that gap.**
- Huge `x.ai/*` extension namespace (~150 methods, ~30 notifications): sessions
  (list/fork/rename/updates/search/usage), git + worktrees, fs + live file index
  (`x.ai/fs/index`, `/delta`, `x.ai/fs_notify`), full PTY terminals
  (`x.ai/terminal/pty/*` — a UI can render *and type into* live terminals),
  rewind, compact, interject, queue editing, MCP management, auth (device flow
  drivable entirely through ACP), hunk tracker. Non-exhaustive by design —
  discover via `initialize` response `_meta`.
- **History reads without files**: `x.ai/session/updates` (offset/limit/stream,
  negative offset = tail). Dedup on `_meta.eventId`.
- **`grok inspect --json`** = the "what is this install configured to do"
  endpoint (version, permissions, hooks, skills, plugins, MCP servers, warnings).
  Every app's doctor/startup check should call it.
- **MCP inversion**: grok is *not* an MCP server, but via `x.ai/mcp/sdk_call` a
  UI can host an in-process MCP server and hand its tools to the agent over the
  ACP reverse channel. (Future capability for apps that want to *be* a tool.)
- **On-disk session dir** `~/.grok/sessions/<urlencoded-cwd>/<uuidv7>/`:
  - `summary.json` — identity/title/model/timestamps (atomic-replace, poll cheap)
  - `signals.json` — **~60 metric fields** (turns, tools, TTFT/ITL percentiles,
    lines added/removed, context %, ratings, PR counts…) — poll cheap, can lag
  - `updates.jsonl` — authoritative ACP `session/update` envelope log (tail)
  - `events.jsonl` — **undocumented** lifecycle stream: `turn_started`,
    `phase_changed` (dominant volume), `first_token`, `tool_completed`,
    `permission_requested/resolved`, `mcp_*` (tail)
  - `hunk_records.jsonl`, `chat_history.jsonl`, `rewind_points.jsonl`,
    `plan.json`, plus `session_search.sqlite` (FTS5) one level up
  - `~/.grok/active_sessions.json` — live registry `{session_id, pid, cwd, opened_at}`
- **Real cost exists on disk and nobody uses it**: `turn_completed.usage.costUsdTicks`
  (1 USD = 10^10 ticks) with per-model breakdown in `modelUsage`. Absence means
  *unknown, never free* — grok scrubs cost fields when partial.
- **Do NOT build on**: the leader Unix-socket framing (internal, version-evicting
  — spawn `grok agent --leader stdio` instead), `grok-tools.proto` gRPC (types
  only, no server in the public tree), `grok share` (disabled), the TUI
  dashboard (no API).

## 2. What grokamp + grokmeter taught us (the expensive way)

Two apps, two branches, **zero shared code**, three incompatible vocabularies
(grokamp's idealized events, grokmeter's feed kinds, the real on-disk ACP names).

| Lesson | Evidence |
|--------|----------|
| A transport interface must include lifecycle + failure | grokamp's `AgentTransport` has no connect/dispose/error; all methods return `void` |
| Interfaces leak without enforcement | grokamp's controller + visualizer reach into `SimTransport` internals (`analyser`, `progress()`) — the "swap in ACP" story is false as written |
| Events need identity | grokamp events carry no `sessionId`/`timestamp`/`eventId`; reattach-dedup (which its own DESIGN.md calls for) is impossible |
| Unknown ≠ zero | grokamp's `costUsd: number` (non-optional) renders `$0.00` lies; grokmeter shows "WINDOW SIZE UNKNOWN" instead of a fake % — the latter is the house style |
| Permissions are option-ids, not booleans | real outcome is `Selected(option_id)`; grokamp models `allow\|deny` |
| Snapshot beats delta-only for reconnect/late-join | grokmeter ships a full `AgentSnapshot` every 900ms; new clients paint instantly |
| Two data tiers, not one | grokmeter tails 3MB of JSONL to derive numbers that `signals.json` already holds; it reads 6 of ~60 fields and replays `events.jsonl` from byte 0 on every attach |
| Single-session assumption calcifies | grokmeter's `let watch: SessionWatch \| null` — fleet apps (PR #8) need `Map<sessionId, …>` from day one |
| The tailer is hard-won — keep it | re-stat by path (atomic replaces), truncation reset, torn-line buffering, EOF-128KB start + skip-first-partial-line, re-entrancy latches |
| Tolerant decode, but log drift | unknown `phase` silently renders "IDLE"; unknown event types drop with no counter. Forward-compat yes, silent no |
| Open tool names + derived classification | grokmeter's open strings + `toolAbbrev()` beat grokamp's closed `ToolKind` union; keep `classifyTool(name) → kind` as *derived* metadata |
| Synthetic demo modes were a wrong turn | both apps independently built seeded fake-data generators (`mulberry32`); policy is now **real data only** — dev and test against recorded real sessions and live attach, never invented numbers |
| Formatting gets duplicated instantly | grokamp inlines token/cost/% formatting 6+ times; grokmeter has `fmtTokens/fmtDur/…` + `TOOL_ABBREV` buried in a web lib |
| Both converged on the same strict tsconfig | near-identical max-strictness configs incl. `skipLibCheck: false`, `erasableSyntaxOnly` — extract once |
| Nobody wrote lint/CI/AGENTS.md | zero linters, zero CI, zero app-level agent docs across both originals; grokamp even has `eslint-disable` comments for a linter that isn't installed |
| Launcher config will collide | both original branches added one root `.claude/launch.json` with a single different entry — needs one merged registry (convention below) |
| README honesty ledger is worth templating | grokmeter's "Data provenance" table (✅ real / ⚠️ stale-prone / 🎭 decorative) under "honest data, decorative motion: never fake the numbers" |

## 3. The scaffolding

### 3.1 Repository layout (this document defines the convention)

```
SCAFFOLDING.md           # this doc — the source of truth
AGENTS.md                # gains the operator-app playbook (§3.7)
README.md                # gallery: every app, one screenshot, one line, run cmd
tsconfig.base.json       # the shared max-strictness config (extracted, both apps agree)
package.json             # bun workspace root: packages/* + apps/* + starters/*
packages/                # shared TypeScript (bun, zero/near-zero deps)
  protocol/              # @grokops/protocol   — types, folds, snapshots, cost, classify
  transport/             # @grokops/transport  — AgentClient over stdio/WS + ~/.grok observer
  format/                # @grokops/format     — fmtTokens/fmtCost/fmtDur/fmtRate/toolAbbrev
  hub/                   # @grokops/hub        — Bun WS telemetry hub + typed client store
  testkit/               # @grokops/testkit    — fixture loaders, golden asserts, drift checks
fixtures/                # recorded real sessions (scrubbed) + goldens — TEST INPUTS ONLY, never an app runtime mode
rust/                    # grok-ops Rust workspace (core crate + observer + starter deps)
swift/                   # GrokBuildKit Swift package (our ACP SDK — none exists upstream)
starters/
  expo/                  # create-from template: WS transport, session list, turn view, permission sheet
  swiftui/               # macOS menu-bar/panel starter on GrokBuildKit
  rust-tui/              # ratatui starter on grok-ops crates
  web/                   # plain Bun.serve + hub starter (grokmeter's shape, generalized)
bin/
  new-app.ts             # scaffolder: bun bin/new-app.ts --stack expo|swiftui|rust|web --name X
  record.ts              # capture a live ~/.grok session → scrubbed fixture
apps/                    # the gallery — grokamp (#6) + grokmeter (#5) land here; new apps too
```

Notes:
- Apps stay **independently runnable** (`bun run dev` / `check` inside each
  app). The workspace exists so apps import `@grokops/*`, not to couple builds.
- The `rust/` workspace stays self-contained (own `Cargo.toml`, own lockfile)
  — the same detachment discipline grokamp's `src-tauri` used with its empty
  `[workspace]` table.
- One root `.claude/launch.json` with an entry per app (per-app dev-preview
  registry; resolves through this repo's `.agents/` symlink convention). Every
  new app adds its entry — this is what killed the two-branch collision.

### 3.2 `@grokops/protocol` — one vocabulary, three layers

The core package. Everything else depends on it; it depends on nothing.

**Layer 1 — wire types (generated).** TS types for **all** of: ACP
`session/update` variants, the xAI `SessionUpdate` extension enum
(`xai-grok-shell/src/extensions/notification.rs:442` in the recon tree),
`events.jsonl` records, `signals.json` (all ~60 fields), `summary.json`,
`active_sessions.json`, and headless `streaming-json` lines. This is the
consumption point for the schema work — generated output drops into
`packages/protocol/src/generated/` (and Swift Codables into `swift/`; Rust
uses the real upstream crates directly). Until generation exists, we
hand-write the subset the folds consume, in the same file layout, so swapping
in generated types is a diff, not a rewrite.

> **Audit note:** `packages/grok-harness` (PR #7, reference #9) covers
> adjacent ground per its file layout (paths, state-files, updates/events,
> tail, methods, headless, leader). It is audited against the checklist above
> — whatever it already types correctly becomes the interim Layer-1
> implementation; whatever it misses gets added. The checklist is the
> contract; the package is not assumed complete.

**Layer 2 — folds (pure functions, the crown jewels).**
`foldUpdate(state, envelope)`, `foldEvent(state, record)`, `foldHunk(state, record)`,
`foldSignals(state, json)` — extracted from grokmeter's `SessionWatch`, made pure,
plus the pieces it skipped: `tool_call_update`, `turn_completed` (→ **real usage
+ costUsdTicks**), `session_recap`. Fully unit-tested against fixtures. Unknown
variants fold into `state.drift` counters (tolerant *and* loud).

**Layer 3 — projections.**
`snapshot(state): AgentSnapshot` (grokmeter's 40-field struct, grouped into
`identity / lifecycle / counters / context / latency / churn / tools / permissions`),
`feed(state): FeedItem[]`, `deriveCost(usage): Cost | "unknown"` (ticks ÷ 1e10,
per-model; absent ≠ zero — the type forces callers to handle "unknown"),
`classifyTool(name): ToolKind` (open string in, derived category out),
`phaseOf(state)`, `progressHint(state)` (honest: no fake ETA).

Rules baked into the types: every event carries `{sessionId, at, eventId?}`;
optional means unknown; no closed unions over values grok-build can extend
(phase, tool names, update kinds all `string`-widened with known-value helpers).

### 3.3 `@grokops/transport` — one interface, three implementations

```ts
interface AgentClient {
  connect(): Promise<SessionHandle>;          // explicit lifecycle
  dispose(): Promise<void>;
  events: Stream<ClientEvent>;                // normalized L1 events + connection state
  // acting (no-ops throw NotSupported on read-only transports):
  prompt(input: PromptInput): Promise<void>;
  respondPermission(requestId: string, optionId: string): void;  // option-ids, not booleans
  cancel(): void;
  call<M extends XaiMethod>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>; // typed x.ai/* escape hatch
}
```

1. **`stdio`** — spawns `grok agent --leader stdio`, JSON-RPC framing, initialize
   handshake with `clientIdentifier`, capability discovery from `_meta`.
2. **`websocket`** — `ws(s)://host/ws` with `?server-key=`; reconnect w/ backoff;
   resume via `session/load` + `x.ai/session/updates` tail + eventId dedup.
3. **`observer`** — read-only ~/.grok: active_sessions discovery + pid liveness,
   **snapshot tier** (poll summary/signals) and **stream tier** (tail
   events/updates/hunks) as separately subscribable capabilities,
   `Map<sessionId, watch>` multi-session from day one, grokmeter's tailer
   preserved behavior-for-behavior. Also reads **historical** sessions the same
   way — history browsing is a real-data feature, always presented *as*
   history (never replayed as if live).

There is deliberately **no sim/replay transport**: if an `AgentClient` can
fabricate a session, someone will ship a demo on it. Recorded fixtures live in
`@grokops/testkit` and feed pure functions in tests — they never reach an
app's runtime.

Same shape in Rust (`grok-ops-transport` on top of `agent-client-protocol 0.10.4`
— the exact crate/version grok-build itself uses) and Swift (GrokBuildKit).

### 3.4 Fixtures — recorded real sessions, for tests only

`bin/record.ts`: point at a live/finished session dir → copies the four JSONL
files + summary/signals snapshots → **scrubs** (home paths, emails, tokens,
secret-shaped strings) → writes `fixtures/<name>/` with a manifest (grok
version, duration, event counts, what it demonstrates). Goldens: expected
`AgentSnapshot` at checkpoints, so `foldUpdate` regressions and **upstream
schema drift** both fail loudly in `testkit`.

Seed corpus to record: a multi-turn refactor with permissions, a doom-loop/error
session, a compaction event, an MCP-heavy session, a fork/worktree session, a
subagent session. The same corpus doubles as the **cross-language conformance
suite**: TS, Rust, and Swift folds must produce identical goldens.

Scope is strict: fixtures are inputs to pure functions in tests. They are not
a runtime mode, not a demo, not a starter default. **The dev loop runs on real
data** — your `~/.grok` already holds history (the observer reads it), a live
session is one `grok agent stdio` away, and `active_sessions.json` usually
lists one running already. CI needs no grok binary: fold tests consume
fixtures directly; transport integration tests run locally where grok exists.

### 3.5 Per-framework kits

**Expo / React Native (`starters/expo`)**
- Transport: **WebSocket only** (no process spawning on mobile). Pairing screen
  for host+secret (QR pairing later); loopback caveats documented (simulator vs
  device + LAN).
- Ships: `@grokops/protocol`+`transport` via workspace, a `useAgent(sessionId)`
  hook (snapshot + feed + connection state), permission-prompt sheet wired to
  option-ids, reconnect/resume logic.
- Dev loop: real data over the real websocket path — either `grok agent serve`
  directly, or a local `@grokops/hub` bridging your own live/historical
  `~/.grok` sessions (observer → WS) to the device/simulator.

**SwiftUI (`swift/` + `starters/swiftui`)**
- **GrokBuildKit** (SPM package) — the Swift ACP SDK that doesn't exist upstream:
  - `ACPConnection` actor: JSON-RPC 2.0 over stdio (`Foundation.Process`, macOS)
    and WebSocket (`URLSessionWebSocketTask`, macOS+iOS).
  - Codable wire types (generated alongside Layer 1 when generation lands;
    hand-rolled subset until, kept honest by the shared fixture goldens).
  - `SessionStore` (@Observable) mirroring `AgentSnapshot` + feed.
  - `GrokHomeObserver` for read-only ~/.grok mode (note: needs sandbox
    entitlement or no-sandbox dev signing; document both).
- Starter: menu-bar operator panel (sessions list, live turn, approve/deny) —
  the natural mac form factor for an operator deck.

**Rust (`rust/`)**
- `grok-ops-protocol` (folds/snapshot mirroring the TS package — same fixture
  goldens keep the two implementations honest), `grok-ops-transport`
  (stdio+WS on `agent-client-protocol` 0.10.4), `grok-ops-observer`
  (notify-based ~/.grok watcher; fs-events are affordable here).
- `starters/rust-tui`: ratatui starter — beast-mode terminal operator surface.
  (egui/wgpu later if an app wants pixels instead of cells.)

### 3.6 Shared conventions (the boring stuff that compounds)

- **Runtime**: bun for all TS (both apps already chose it). `bun run dev` and
  `bun run check` are the universal verbs in every app/package.
- **`check` = typecheck + test + lint.** Extracted `tsconfig.base.json`
  (max-strict, `erasableSyntaxOnly`, `skipLibCheck: false`). Add **oxlint**
  (fast, zero-config; both apps currently have nothing). Tests: `bun test`,
  mandatory for `packages/*` (pure folds + fixtures = cheap), optional for app chrome.
- **Security defaults**: bind loopback, WS origin allowlist (grokmeter's
  `allowedOrigin` generalized into `@grokops/hub`), secrets via env only,
  fixture scrubber run at record time + a testkit assert that no fixture
  contains secret-shaped strings or home paths.
- **Honesty**: **no synthetic data, period** — every rendered number traces to
  a real session, live or historical. README template includes grokmeter's
  provenance ledger (✅ real / ⚠️ stale-prone / 🎭 decorative — where 🎭 covers
  *motion/ornament only*, never numbers); `deriveCost`/context-% return
  `"unknown"` rather than 0; drift counters surfaced in every app's debug view.
- **Doctor**: `@grokops/transport` ships `doctor()` — grok binary present?
  version vs tested range (we pin "tested against 0.2.117")? auth present?
  leader alive? active sessions? `grok inspect --json` parse. Starters render
  its result on first launch instead of a blank screen.
- **Gallery discipline**: every app ships one screenshot/gif in the apps
  catalog (captured against a real session) + its provenance ledger. Apps are
  otherwise free to be weird — **no shared design system on purpose**; the
  shared layer stops at semantics (phase names, tool classification, status
  colors stay per-app).

### 3.7 The playbook in `AGENTS.md` (because agents build these apps)

Every app so far was built by a coding-agent session, and neither original
branch left docs for the next one. The playbook is scaffolding too — it lives
as a section of the root `AGENTS.md`:

1. Where the packages are, what each exports, what the fixtures contain.
2. The new-app checklist: run `bin/new-app.ts`, pick transport(s), point it at
   your real `~/.grok` / a live session first, `bun run check` green,
   launch.json entry, gallery row, provenance ledger.
3. The rules: **real data only — no sim/demo modes, ever**; never invent event
   vocabularies (extend `@grokops/protocol`); never render fake numbers;
   unknown ≠ zero; permissions are option-ids; multi-session unless justified.
4. Pointers into the grok-build recon tree for spelunking (the §1 surface
   catalog, with its crate/file anchors, stays current here).

## 4. Build order

| Phase | Deliverable | Unblocks |
|-------|-------------|----------|
| **0** | workspace root (`package.json`, `tsconfig.base.json`) + AGENTS.md playbook + merged launch.json registry | everything |
| **1** | `@grokops/protocol` (hand-written L1 subset per §3.2 checklist + folds + snapshot + cost) + `@grokops/format` + fixtures: `bin/record.ts` + 2–3 recorded sessions + goldens in `testkit` | first honest numbers incl. cost |
| **2** | `@grokops/transport`: `observer` (live tail + historical reads, multi-session) | grokmeter re-platform; history browsing; fleet (#8) on shared substrate |
| **3** | `@grokops/transport`: `stdio` + `websocket` + `@grokops/hub` | grokamp's real wiring; web/remote apps |
| **4** | `starters/web` + `starters/expo` | first new apps at speed |
| **5** | `swift/GrokBuildKit` + `starters/swiftui`; `rust/` crates + `starters/rust-tui` | native tracks |
| **6** | re-platform grokamp (#6) + grokmeter (#5) onto the shared packages; **delete grokamp's `SimTransport` and grokmeter's `demo.ts`** per the real-data policy | dogfood proof; three duplicate vocabularies deleted |

Phase 1 is **not gated** on any in-flight PR: the hand-written L1 subset
proceeds regardless, and #7/#9 are folded in wherever the audit (§3.2) says
they already satisfy the checklist.

Schema handoff: whenever type generation lands, its generated TS/Swift types
replace `protocol/src/generated/`; folds and everything above them don't change.

## 5. Open questions (defaults chosen, flag to change)

- **Package scope**: `@grokops/*` (default) vs `@grok-build/*` vs `@grokamp/*`.
- **Layer-1 home**: sibling package importing the audited `grok-harness` (default)
  vs folding harness content directly into `@grokops/protocol`.
- **Where apps live**: **answered** — `apps/<slug>/` in this repository; the
  one-branch-per-app era is over (per-app branches don't share packages).
- **Expo state lib**: starter ships TanStack Store (grokamp precedent) — swap freely per app.
- **Linter**: oxlint (default) vs biome vs none.
- **CI**: `bun run check` at the workspace root is the gate; add GitHub Actions
  when it starts paying for itself.

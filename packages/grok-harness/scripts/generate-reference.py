#!/usr/bin/env python3
"""Regenerate REFERENCE.md from a local grok-build checkout.

Usage:
  GROK_BUILD_SRC=/path/to/grok-build python3 scripts/generate-reference.py

Defaults GROK_BUILD_SRC to ../../../grok-build relative to this repo if present,
or $HOME/dev/tools/grok-build.
"""
from __future__ import annotations

import datetime
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
REPO = PKG.parent.parent


def find_src() -> Path:
    env = os.environ.get("GROK_BUILD_SRC")
    if env:
        return Path(env).expanduser().resolve()
    for cand in (
        REPO.parent / "grok-build",
        Path.home() / "dev/tools/grok-build",
        Path("/Users/esthor/dev/tools/grok-build"),
    ):
        if (cand / "SOURCE_REV").is_file():
            return cand.resolve()
    sys.exit("Set GROK_BUILD_SRC to a grok-build checkout containing SOURCE_REV")


def camel_to_snake(s: str) -> str:
    out: list[str] = []
    for i, c in enumerate(s):
        if c.isupper() and i > 0:
            out.append("_")
        out.append(c.lower())
    return "".join(out)


def snake_to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def extract_body(text: str, kind: str, name: str) -> str | None:
    m = re.search(rf"pub {kind} {name}\s*(?:<[^>]*>)?\s*\{{", text)
    if not m:
        return None
    start = m.end() - 1
    depth = 0
    for i, c in enumerate(text[start:], start):
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
    return None


def parse_variants(body: str) -> list[tuple[str, list[str]]]:
    variants: list[tuple[str, list[str]]] = []
    i = 0
    while i < len(body):
        m = re.match(r"\s*(///[^\n]*\n|//[^\n]*\n|#\[[^\]]*\]\s*)*", body[i:])
        if m:
            i += m.end()
        m = re.match(r"\s*([A-Z][A-Za-z0-9_]*)", body[i:])
        if not m:
            i += 1
            continue
        name = m.group(1)
        i += m.end()
        while i < len(body) and body[i] in " \t\n":
            i += 1
        fields: list[str] = []
        if i < len(body) and body[i] == "{":
            depth = 0
            j = i
            for k, c in enumerate(body[i:], i):
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        j = k
                        break
            block = body[i + 1 : j]
            for fm in re.finditer(r"(?:pub\s+)?([a-z][a-z0-9_]*)\s*:", block):
                fields.append(fm.group(1))
            i = j + 1
        elif i < len(body) and body[i] == "(":
            depth = 0
            j = i
            for k, c in enumerate(body[i:], i):
                if c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                    if depth == 0:
                        j = k
                        break
            fields = ["(tuple)"]
            i = j + 1
        variants.append((camel_to_snake(name), fields))
    return [(n, f) for n, f in variants if len(n) > 1]


def parse_struct_fields(body: str) -> list[str]:
    return [fm.group(1) for fm in re.finditer(r"(?:pub\s+)?([a-z][a-z0-9_]*)\s*:", body)]


def main() -> None:
    up = find_src()
    source_rev = (up / "SOURCE_REV").read_text().strip()
    types_rs = (up / "crates/codegen/xai-file-utils/src/events/types.rs").read_text()
    notif_rs = (up / "crates/codegen/xai-grok-shell/src/extensions/notification.rs").read_text()
    proto_rs = (up / "crates/codegen/xai-grok-shell/src/leader/protocol.rs").read_text()
    roster_rs = (up / "crates/codegen/xai-grok-shell/src/agent/roster.rs").read_text()
    active_rs = (up / "crates/codegen/xai-grok-shell/src/active_sessions.rs").read_text()
    signals_rs = (up / "crates/codegen/xai-grok-shell/src/session/signals.rs").read_text()
    persist_rs = (up / "crates/codegen/xai-grok-shell/src/session/persistence.rs").read_text()
    hooks_event = (up / "crates/codegen/xai-grok-hooks/src/event.rs").read_text()
    headless_rs = (up / "crates/codegen/xai-grok-pager/src/headless.rs").read_text()
    schema_rs = (up / "crates/codegen/xai-grok-telemetry/src/external/schema.rs").read_text()
    acp_agent = (up / "crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs").read_text(errors="replace")
    session_h = (up / "crates/codegen/xai-grok-shell/src/agent/handlers/session.rs").read_text(errors="replace")

    events = parse_variants(extract_body(types_rs, "enum", "Event") or "")
    nested = {}
    for ename in [
        "Phase", "ToolOutcome", "PermissionDecision", "TurnOutcomeLabel",
        "SessionRelationship", "CancellationCategory", "InterjectionSource", "RedirectKind",
    ]:
        b = extract_body(types_rs, "enum", ename)
        if b:
            nested[ename] = [n for n, _ in parse_variants(b)]

    session_updates = parse_variants(extract_body(notif_rs, "enum", "SessionUpdate") or "")
    client_msgs = parse_variants(extract_body(proto_rs, "enum", "ClientMessage") or "")
    server_msgs = parse_variants(extract_body(proto_rs, "enum", "ServerMessage") or "")
    control_cmds = parse_variants(extract_body(proto_rs, "enum", "ControlCommand") or "")
    control_payloads = parse_variants(extract_body(proto_rs, "enum", "ControlPayload") or "")
    shutdown = parse_variants(extract_body(proto_rs, "enum", "ShutdownReason") or "")
    caps_fields = parse_struct_fields(extract_body(proto_rs, "struct", "ClientCapabilities") or "")
    roster_fields = parse_struct_fields(extract_body(roster_rs, "struct", "RosterEntry") or "")
    activity = parse_variants(extract_body(roster_rs, "enum", "RosterActivity") or "")
    active_fields = parse_struct_fields(extract_body(active_rs, "struct", "ActiveSession") or "")
    summary_fields = parse_struct_fields(extract_body(persist_rs, "struct", "Summary") or "")
    signals_fields = parse_struct_fields(extract_body(signals_rs, "struct", "SessionSignals") or "")

    m = re.search(r"BUILTIN_TOOL_NAMES: &\[&str\] = &\[(.*?)\];", schema_rs, re.S)
    tools = re.findall(r'"([^"]+)"', m.group(1)) if m else []
    streaming = sorted(set(re.findall(r'"type"\s*:\s*"([a-z_]+)"', headless_rs)) | set(re.findall(r'\{"type":\s*"([a-z_]+)"', headless_rs)))
    streaming = [t for t in streaming if t not in ("object", "acp")]

    hooks: list[str] = []
    seen: set[str] = set()
    for h in re.findall(r'display:\s*"([a-z_]+)"', hooks_event):
        if h not in seen:
            seen.add(h)
            hooks.append(h)

    methods = sorted(set(re.findall(r'"(x\.ai/[a-zA-Z0-9_./-]+)"', acp_agent + session_h)))
    acp_kinds = [
        "user_message_chunk", "agent_message_chunk", "agent_thought_chunk", "tool_call",
        "tool_call_update", "plan", "available_commands_update", "current_mode_update",
    ]
    harness_modules = sorted(p.stem for p in (PKG / "src").glob("*.ts") if p.name != "index.ts")
    mod_desc = {
        "json": "Tolerant JSON helpers (never throw on torn lines)",
        "paths": "$GROK_HOME, SESSION_FILES, HOME_FILES, cwd encode/decode, .cwd marker",
        "events": "Full events.jsonl vocabulary + nested enums",
        "updates": "updates.jsonl envelope, all kinds, usage/cost/tool/subagent/task accessors",
        "state-files": "active_sessions, summary, signals, hunk_records",
        "tail": "Byte-offset JSONL tailer (short-read + UTF-8 safe)",
        "leader": "Socket framing, control, roster parse",
        "headless": "streaming-json + final json result",
        "tools": "BUILTIN_TOOL_NAMES + CanonicalToolMeta",
        "hooks": "Hook events, aliases, config, envelope, gate",
        "methods": "ACP + x.ai/* method constants",
    }

    L: list[str] = []
    A = L.append
    A("# Grok Build interface reference")
    A("")
    A("End-to-end map of every grok-build CLI / session surface that apps monitor or drive.")
    A("This is the **canonical field-level reference** for `packages/grok-harness`.")
    A("")
    A("| | |")
    A("|---|---|")
    A(f"| **Upstream SOURCE_REV** | `{source_rev}` |")
    A(f"| **Generated** | {datetime.date.today().isoformat()} from `{up}` |")
    A("| **Harness package** | `@grok-build-app/grok-harness` |")
    A("| **Verify** | `cd packages/grok-harness && bun run verify` |")
    A("| **Regenerate** | `GROK_BUILD_SRC=… bun run reference` |")
    A("")
    A("Wire shapes change. After a grok-build upgrade: regenerate this file, update the package, re-run verify.")
    A("")
    A("## Contents")
    A("")
    for i, title in enumerate([
        "Layout on disk", "Path encoding", "events.jsonl", "updates.jsonl", "State files",
        "Leader socket", "Headless CLI", "Tools", "Hooks", "ACP / x.ai methods",
        "Semantics traps", "Harness module map",
    ], 1):
        slug = title.lower().replace(" ", "-").replace("/", "").replace(".", "")
        A(f"{i}. [{title}](#{i}-{slug})")
    A("")
    A("---")
    A("")
    A("## 1. Layout on disk")
    A("")
    A("Root: `$GROK_HOME` (default `~/.grok`, override env `GROK_HOME`).")
    A("")
    A("### Home-level")
    A("")
    A("| Path | Purpose |")
    A("|---|---|")
    for row in [
        ("active_sessions.json", "Live TUI sessions (array of `{session_id,pid,cwd,opened_at}`)"),
        ("active_sessions.lock", "Lock for active_sessions writes"),
        ("leader.sock", "Leader Unix domain socket"),
        ("leader.lock", "Leader singleton lock"),
        ("config.toml", "User config (hooks, models, permissions, …)"),
        ("pager.toml", "Pager/TUI config"),
        ("logs/unified.jsonl", "Unified log stream"),
        ("auth.json", "Auth material"),
        ("version.json", "Installed version metadata"),
        ("disabled-hooks", "One disabled hook name per line"),
        ("trusted-hook-projects", "Legacy project-hook trust"),
    ]:
        A(f"| `{row[0]}` | {row[1]} |")
    A("")
    A("### Session directory")
    A("")
    A("`$GROK_HOME/sessions/<encode_cwd_dirname(cwd)>/<session_id>/`")
    A("")
    A("| File / dir | Module | Role |")
    A("|---|---|---|")
    for row in [
        ("summary.json", "state-files", "Identity, model, git, kind, title"),
        ("signals.json", "state-files", "Cumulative counters (**can lag hours**)"),
        ("events.jsonl", "events + tail", "Structured telemetry"),
        ("updates.jsonl", "updates + tail", "Authoritative ACP + xAI transcript"),
        ("hunk_records.jsonl", "state-files + tail", "Per-hunk LOC attribution"),
        ("chat_history.jsonl", "—", "Derived chat cache"),
        ("rewind_points.jsonl", "—", "Rewind markers"),
        ("plan.json / plan_mode.json", "—", "Plan mode state"),
        ("goal/state.json", "—", "Goal mode state"),
        ("announcement_state.json", "—", "Announcements"),
        ("resources_state.json", "—", "Resources"),
        ("system_prompt.txt", "—", "Rendered system prompt"),
        ("prompt_context.json", "—", "Structured prompt context"),
        ("compaction_checkpoints/", "—", "Compacted history blobs"),
        ("images/", "—", "Attached images"),
        ("subagents/", "—", "Subagent metadata"),
    ]:
        A(f"| `{row[0]}` | `{row[1]}` | {row[2]} |")
    A("")
    A("Long cwd dirs may contain a sibling `.cwd` marker file with the original absolute path.")
    A("")
    A("---")
    A("")
    A("## 2. Path encoding")
    A("")
    A("**Source:** `xai-grok-config/src/paths.rs`")
    A("")
    A("1. URL-encode the absolute cwd (`/Users/x/dev` → `%2FUsers%2Fx%2Fdev`).")
    A("2. If encoded length ≤ **255** bytes → use it (reversible via `decodeURIComponent`).")
    A("3. Else → `{slug}-{blake3_hex16}` and write `.cwd` with the original path.")
    A("4. Decode: URL-decode if absolute; else read `.cwd`.")
    A("")
    A("Session id for path joins: UUID-shaped `[0-9a-fA-F-]{8,64}` only.")
    A("")
    A("---")
    A("")
    A("## 3. events.jsonl")
    A("")
    A("**Source:** `xai-file-utils/src/events/types.rs` `Event`")
    A("")
    A("```json")
    A('{"ts":"<RFC3339 ms UTC>","type":"<snake_case>", ...fields}')
    A("```")
    A("")
    A(f"**{len(events)} event types:**")
    A("")
    A("| `type` | Fields (snake_case wire) |")
    A("|---|---|")
    for name, fields in events:
        A(f"| `{name}` | {', '.join(fields) if fields else '—'} |")
    A("")
    A("### Nested enums")
    A("")
    for ename, vals in nested.items():
        A(f"**{ename}:** " + ", ".join(f"`{v}`" for v in vals))
        A("")
    A("### Harness parsing policy")
    A("")
    A("- Primary types → dedicated `GrokEvent` arms.")
    A("- All `mcp_*` → `{ type: \"mcp\", subtype, fields }`.")
    A("- Goal / todo / laziness → `{ type: \"orchestration\", subtype, fields }`.")
    A("- Unknown → `{ type: \"other\", subtype, fields }`; torn lines → `null`.")
    A("")
    A("---")
    A("")
    A("## 4. updates.jsonl")
    A("")
    A("### Envelope")
    A("")
    A("```json")
    A('{')
    A('  "timestamp": <unix_secs>,')
    A('  "method": "session/update" | "_x.ai/session/update",')
    A('  "params": {')
    A('    "sessionId": "...",')
    A('    "update": { "sessionUpdate": "<kind>", ... },')
    A('    "_meta": { "eventId"?: number, "agentTimestampMs"?: number, "totalTokens"?: number }')
    A("  }")
    A("}")
    A("```")
    A("")
    A("Tool meta: `params.update._meta[\"x.ai/tool\"]`.")
    A("")
    A("### ACP standard kinds")
    A("")
    A("| `sessionUpdate` |")
    A("|---|")
    for k in acp_kinds:
        A(f"| `{k}` |")
    A("")
    xai = [(n, f) for n, f in session_updates if n != "unknown"]
    A(f"### xAI extension kinds ({len(xai)} variants)")
    A("")
    A("| `sessionUpdate` | Fields |")
    A("|---|---|")
    for name, fields in xai:
        fl = ", ".join(fields) if fields and fields != ["(tuple)"] else ("(nested/tuple)" if fields == ["(tuple)"] else "—")
        A(f"| `{name}` | {fl} |")
    A("")
    A("### PromptUsage (`turn_completed.usage`) — camelCase")
    A("")
    A("| Field | Notes |")
    A("|---|---|")
    A("| `inputTokens` | **FULL** — **includes** cache reads |")
    A("| `outputTokens`, `totalTokens`, `cachedReadTokens`, `reasoningTokens` | |")
    A("| `modelCalls`, `apiDurationMs` | |")
    A("| `costUsdTicks` | 1e10 ticks = $1; fail-closed |")
    A("| `costIsPartial`, `usageIsIncomplete` | omit if false |")
    A("| `modelUsage`, `numTurns` | |")
    A("")
    A("Use `effectiveCostUsdTicks(usage)`.")
    A("")
    A("---")
    A("")
    A("## 5. State files")
    A("")
    A("### active_sessions.json")
    A("")
    A("Top-level **array**. Fields: " + ", ".join(f"`{f}`" for f in active_fields))
    A("")
    A("Always verify `pid` liveness.")
    A("")
    A("### summary.json")
    A("")
    A("| Field |")
    A("|---|")
    for f in summary_fields:
        A(f"| `{f}` |")
    A("")
    A("### signals.json")
    A("")
    A("**camelCase**, can lag hours. Fields:")
    A("")
    A("| Field |")
    A("|---|")
    for f in signals_fields:
        A(f"| `{snake_to_camel(f)}` |")
    A("")
    A("### hunk_records.jsonl")
    A("")
    A("Keep **latest** per `hunkId`. camelCase: `hunkId`, `filePath`, `hunkStart`, `hunkEnd`, `linesAdded`, `linesRemoved`, `authorType`, `authorId`, `agentId`, `sessionId`, `timestamp`, `promptIndex`, `sourceType`, `eventType`, `removalReason`.")
    A("")
    A("---")
    A("")
    A("## 6. Leader socket")
    A("")
    A("| | |")
    A("|---|---|")
    A("| Socket | `$GROK_HOME/leader.sock` (`$GROK_LEADER_SOCKET`) |")
    A("| Framing | u32 **big-endian** length + JSON |")
    A("| Max | 64 MiB |")
    A("| Version | 1 |")
    A("")
    A("### ClientMessage / ServerMessage")
    A("")
    A("| Client type | Fields |")
    A("|---|---|")
    for n, f in client_msgs:
        A(f"| `{n}` | {', '.join(f) if f else '—'} |")
    A("")
    A("| Server type | Fields |")
    A("|---|---|")
    for n, f in server_msgs:
        A(f"| `{n}` | {', '.join(f) if f else '—'} |")
    A("")
    A("**ClientCapabilities:** " + ", ".join(f"`{f}`" for f in caps_fields))
    A("")
    A("**ControlCommand:** " + ", ".join(f"`{n}`" for n, _ in control_cmds))
    A("")
    A("**ControlPayload:** " + ", ".join(f"`{n}`" for n, _ in control_payloads))
    A("")
    A("**ShutdownReason:** " + ", ".join(f"`{n}`" for n, _ in shutdown))
    A("")
    A("Notifications may use `_x.ai/...` with nested params — use `canonicalMethod` / `methodsEqual`.")
    A("")
    A("### Roster")
    A("")
    A("| Method | Payload |")
    A("|---|---|")
    A("| `x.ai/sessions/list` | `{ sessions: RosterEntry[] }` |")
    A("| `x.ai/sessions/changed` | `{ upserted, removed }` |")
    A("")
    A("**RosterEntry:** " + ", ".join(f"`{snake_to_camel(f) if '_' in f else f}`" for f in roster_fields))
    A("")
    A("**Activity:** " + ", ".join(f"`{n}`" for n, _ in activity))
    A("")
    A("---")
    A("")
    A("## 7. Headless CLI")
    A("")
    A("### streaming-json types")
    A("")
    A("| type |")
    A("|---|")
    for t in streaming:
        A(f"| `{t}` |")
    A("")
    A("### Final json result")
    A("")
    A("| Field | Notes |")
    A("|---|---|")
    A("| `usage.input_tokens` | **UNCACHED** (opposite of updates.jsonl) |")
    A("| `usage.cache_read_input_tokens`, `output_tokens`, `reasoning_tokens`, `total_tokens` | |")
    A("| `num_turns`, `usage_is_incomplete`, `cost_is_partial` | |")
    A("| `total_cost_usd_ticks`, `total_cost_usd`, `modelUsage` | fail-closed ticks |")
    A("")
    A("---")
    A("")
    A("## 8. Tools")
    A("")
    A(f"**{len(tools)} built-ins:**")
    A("")
    A("| Name |")
    A("|---|")
    for t in tools:
        A(f"| `{t}` |")
    A("")
    A("MCP: `server__tool`. Meta key: `x.ai/tool`. Schema: `schema/tool_meta.schema.json`.")
    A("")
    A("---")
    A("")
    A("## 9. Hooks")
    A("")
    A("| name |")
    A("|---|")
    for h in hooks:
        A(f"| `{h}` |")
    A("")
    A("Config: `{ \"<event>\": [ { matcher?, hooks: [{ type, command?, url?, timeout?, env? }] } ] }`.")
    A("Client methods: `x.ai/hooks/run` (gate), `x.ai/hooks/event` (observe).")
    A("")
    A("---")
    A("")
    A("## 10. ACP / x.ai methods")
    A("")
    A(f"{len(methods)} methods observed in agent routers:")
    A("")
    A("| Method |")
    A("|---|")
    for mth in methods:
        A(f"| `{mth}` |")
    A("")
    A("---")
    A("")
    A("## 11. Semantics traps")
    A("")
    A("| Trap | Rule |")
    A("|---|---|")
    A("| Dual inputTokens | updates includes cache; headless excludes |")
    A("| Cost | absent/incomplete/partial ⇒ UNKNOWN, never $0 |")
    A("| `_meta.totalTokens` | occupancy not spend; drops on compaction |")
    A("| signals.json | lag hours — seed only |")
    A("| phase_changed | ~90% of events — debounce |")
    A("| Subagents | session_kind starts with subagent |")
    A("| Terminal tools | both run_terminal_cmd and run_terminal_command |")
    A("| Atomic JSON | re-open by path; JSONL may tear |")
    A("| Roster notifs | may be `_x.ai/sessions/changed` |")
    A("")
    A("---")
    A("")
    A("## 12. Harness module map")
    A("")
    A("| Module | File | Responsibility |")
    A("|---|---|---|")
    for m in harness_modules:
        A(f"| `{m}` | `src/{m}.ts` | {mod_desc.get(m, '—')} |")
    A("")
    A("Also: `schema/catalog.json` (machine-readable constants), `schema/tool_meta.schema.json`.")
    A("")
    A("---")
    A("")
    A(f"*Generated from `{up}` @ `{source_rev}`. Unofficial mirror of grok-build interfaces.*")
    A("")

    out = PKG / "REFERENCE.md"
    out.write_text("\n".join(L))
    print(f"Wrote {out} ({out.stat().st_size} bytes)")
    print(f"events={len(events)} xai_updates={len(xai)} tools={len(tools)} hooks={len(hooks)} methods={len(methods)}")
    print(f"SOURCE_REV={source_rev}")


if __name__ == "__main__":
    main()

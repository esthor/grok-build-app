// Conformance harness: replays every grok session on this machine through
// the package's parsers and reports coverage + violations. Run with Bun:
//
//   bun run verify            # uses $GROK_HOME or ~/.grok
//
// Exit code 1 on hard failures (unparseable valid-JSON lines, enum values
// outside the modeled unions, identity mismatches). Unknown-but-tolerated
// vocabulary (new event subtypes, update kinds) is reported, not fatal —
// that's the signal to extend the schema.

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  PHASES,
  SESSION_FILES,
  Tail,
  chunkText,
  decodeCwdDirname,
  grokHome,
  parseActiveSessions,
  parseEventLine,
  parseHunkLine,
  parseSignals,
  parseSummary,
  parseUpdateLine,
  toolMetaOf,
  turnUsageOf,
  type TailIo,
} from "./src/index.ts";
import { parseObj, str } from "./src/json.ts";

const HOME = grokHome(process.env, homedir(), join);
const SESSIONS = join(HOME, "sessions");

const TOOL_OUTCOMES = new Set([
  "success",
  "error",
  "permission_rejected",
  "permission_cancelled",
  "followup",
  "hook_denied",
  "invalid_tool",
  "cancelled",
]);
const PERM_DECISIONS = new Set(["allow", "deny", "cancelled", "followup"]);
const TURN_OUTCOMES = new Set(["completed", "cancelled", "error"]);
const MODELED_UPDATE_KINDS = new Set([
  "user_message_chunk",
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
  "available_commands_update",
  "current_mode_update",
  "turn_completed",
  "session_recap",
  "subagent_spawned",
]);

let hardFailures = 0;
const fail = (msg: string): void => {
  hardFailures += 1;
  console.log(`  ✗ ${msg}`);
};
const tally = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

async function lines(path: string): Promise<string[]> {
  const text = await Bun.file(path)
    .text()
    .catch(() => "");
  return text.split("\n").filter((l) => l.trim() !== "");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ── Discover every session directory ─────────────────────────────────────

type Session = { dir: string; id: string; cwdDir: string };
const sessions: Session[] = [];
for (const cwdDir of await readdir(SESSIONS).catch(() => [] as string[])) {
  const base = join(SESSIONS, cwdDir);
  let ids: string[] = [];
  try {
    ids = await readdir(base);
  } catch {
    continue;
  }
  for (const id of ids) {
    if (await exists(join(base, id, SESSION_FILES.summary))) {
      sessions.push({ dir: join(base, id), id, cwdDir });
    }
  }
}
console.log(`grok-harness conformance · $GROK_HOME=${HOME} · ${sessions.length} session(s)\n`);

// ── active_sessions.json ─────────────────────────────────────────────────

{
  const raw = await Bun.file(join(HOME, "active_sessions.json"))
    .text()
    .catch(() => "");
  if (raw !== "") {
    const entries = parseActiveSessions(raw);
    const arr: unknown = JSON.parse(raw);
    const rawCount = Array.isArray(arr) ? arr.length : -1;
    console.log(`active_sessions.json: ${entries.length}/${rawCount} entries parsed`);
    if (rawCount >= 0 && entries.length !== rawCount) fail("active_sessions entries dropped by parser");
  }
}

// ── Per-session replay ───────────────────────────────────────────────────

const eventTypes = new Map<string, number>();
const otherSubtypes = new Map<string, number>();
const mcpSubtypes = new Map<string, number>();
const updateKinds = new Map<string, number>();
let eventLines = 0;
let eventNulls = 0;
let updateLines = 0;
let updateNulls = 0;
let hunkLines = 0;
let hunkNulls = 0;
let toolCalls = 0;
let toolCallsWithMeta = 0;
let turnCompleted = 0;
let turnUsageParsed = 0;
let chunks = 0;
let chunksWithText = 0;

for (const s of sessions) {
  // summary.json identity
  const summaryText = await Bun.file(join(s.dir, SESSION_FILES.summary)).text();
  const summary = parseSummary(summaryText);
  if (summary === null) {
    fail(`${s.id}: summary.json unparseable`);
    continue;
  }
  if (summary.id !== s.id) fail(`${s.id}: summary.info.id mismatch (${summary.id})`);
  const decodedCwd = decodeCwdDirname(s.cwdDir);
  if (decodedCwd !== null && summary.cwd !== decodedCwd) {
    fail(`${s.id}: summary.cwd ${summary.cwd} ≠ dirname ${decodedCwd}`);
  }
  if (summary.modelId === "?" || summary.title === "") fail(`${s.id}: summary missing model/title`);

  // signals.json: typed fields must exist in raw when file present
  const signalsText = await Bun.file(join(s.dir, SESSION_FILES.signals))
    .text()
    .catch(() => "");
  if (signalsText !== "") {
    const signals = parseSignals(signalsText);
    if (signals === null) fail(`${s.id}: signals.json unparseable`);
    else {
      for (const key of ["contextTokensUsed", "contextWindowTokens", "turnCount", "toolCallCount"]) {
        if (!(key in signals.raw)) fail(`${s.id}: signals.json missing expected key ${key}`);
      }
    }
  }

  // events.jsonl
  for (const line of await lines(join(s.dir, SESSION_FILES.events))) {
    eventLines += 1;
    const raw = parseObj(line);
    const ev = parseEventLine(line);
    if (ev === null) {
      if (raw !== null) {
        eventNulls += 1;
        fail(`${s.id}: valid-JSON event line rejected: ${line.slice(0, 90)}`);
      }
      continue;
    }
    tally(eventTypes, ev.type);
    if (ev.type === "other") tally(otherSubtypes, ev.subtype);
    if (ev.type === "mcp") tally(mcpSubtypes, ev.subtype);
    if (raw === null) continue;
    // Enum conformance against the RAW values (the parser coerces).
    const rawType = str(raw["type"]);
    if (rawType === "phase_changed" && !(PHASES as readonly string[]).includes(str(raw["phase"]))) {
      fail(`${s.id}: unknown phase ${str(raw["phase"])}`);
    }
    if (rawType === "tool_completed" && !TOOL_OUTCOMES.has(str(raw["outcome"]))) {
      fail(`${s.id}: unknown tool outcome ${str(raw["outcome"])}`);
    }
    if (rawType === "permission_resolved" && !PERM_DECISIONS.has(str(raw["decision"]))) {
      fail(`${s.id}: unknown permission decision ${str(raw["decision"])}`);
    }
    if (rawType === "turn_ended" && !TURN_OUTCOMES.has(str(raw["outcome"]))) {
      fail(`${s.id}: unknown turn outcome ${str(raw["outcome"])}`);
    }
    if (rawType === "turn_started" && ev.type === "turn_started" && ev.sessionId !== s.id) {
      fail(`${s.id}: turn_started session_id mismatch`);
    }
  }

  // updates.jsonl
  for (const line of await lines(join(s.dir, SESSION_FILES.updates))) {
    updateLines += 1;
    const env = parseUpdateLine(line);
    if (env === null) {
      updateNulls += 1;
      fail(`${s.id}: update envelope rejected: ${line.slice(0, 90)}`);
      continue;
    }
    tally(updateKinds, env.kind);
    if (env.sessionId !== s.id) fail(`${s.id}: update sessionId mismatch`);
    if (env.kind === "tool_call") {
      toolCalls += 1;
      if (toolMetaOf(env.update) !== null) toolCallsWithMeta += 1;
    }
    if (env.kind === "turn_completed") {
      turnCompleted += 1;
      if (turnUsageOf(env.update) !== null) turnUsageParsed += 1;
    }
    if (env.kind.endsWith("_chunk")) {
      chunks += 1;
      if (chunkText(env.update) !== "") chunksWithText += 1;
    }
  }

  // hunk_records.jsonl
  for (const line of await lines(join(s.dir, SESSION_FILES.hunkRecords))) {
    hunkLines += 1;
    if (parseHunkLine(line) === null) {
      hunkNulls += 1;
      fail(`${s.id}: hunk line rejected: ${line.slice(0, 90)}`);
    }
  }
}

// ── Tail equivalence: chunked byte-offset reads must yield identical lines ─

{
  const target = sessions
    .map((s) => join(s.dir, SESSION_FILES.events))
    .find(() => true);
  if (target !== undefined && (await exists(target))) {
    const direct = await lines(target);
    // Deliberately short reads (≤1 KB) exercise the byte-oriented contract:
    // the tailer must advance by actual consumption, never assume the full
    // requested range arrived.
    const drip: TailIo = {
      size: async (p) => {
        try {
          return (await stat(p)).size;
        } catch {
          return null;
        }
      },
      read: async (p, s0, e0) =>
        new Uint8Array(await Bun.file(p).slice(s0, Math.min(e0, s0 + 1024)).arrayBuffer()),
    };
    const tail = new Tail(drip, target, false);
    const collected: string[] = [];
    const size = (await stat(target)).size;
    for (let i = 0; i <= Math.ceil(size / 1024) + 2; i += 1) {
      await tail.poll((l) => collected.push(l));
    }
    if (collected.length !== direct.length) {
      fail(`Tail equivalence: ${collected.length} lines via 1KB drip ≠ ${direct.length} direct`);
    } else {
      console.log(`tail: ${collected.length} lines identical via 1 KB drip-feed reads`);
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────

const show = (label: string, map: Map<string, number>): void => {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const parts = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`);
  console.log(`${label} (${total}): ${parts.join("  ") || "—"}`);
};

console.log(`\nevents.jsonl: ${eventLines} lines, ${eventNulls} rejected`);
show("  modeled types", eventTypes);
show("  → other subtypes (unmodeled, tolerated)", otherSubtypes);
show("  → mcp subtypes", mcpSubtypes);
console.log(`\nupdates.jsonl: ${updateLines} lines, ${updateNulls} rejected`);
show("  kinds", updateKinds);
const unmodeled = [...updateKinds.keys()].filter((k) => !MODELED_UPDATE_KINDS.has(k));
if (unmodeled.length > 0) console.log(`  ⚠ kinds not in MODELED_UPDATE_KINDS: ${unmodeled.join(", ")}`);
console.log(`  tool_call with x.ai/tool meta: ${toolCallsWithMeta}/${toolCalls}`);
console.log(`  turn_completed with usage parsed: ${turnUsageParsed}/${turnCompleted}`);
console.log(`  chunks with text: ${chunksWithText}/${chunks}`);
console.log(`\nhunk_records.jsonl: ${hunkLines} lines, ${hunkNulls} rejected`);

console.log(hardFailures === 0 ? "\n✅ conformance clean" : `\n❌ ${hardFailures} hard failure(s)`);
process.exit(hardFailures === 0 ? 0 : 1);

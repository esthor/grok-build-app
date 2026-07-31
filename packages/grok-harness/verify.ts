// Conformance harness: replays every grok session on this machine through
// the package's parsers and reports coverage + violations.
//
//   bun run verify

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  PHASES,
  TOOL_OUTCOMES,
  PERMISSION_DECISIONS,
  TURN_OUTCOMES,
  KNOWN_EVENT_TYPES,
  SESSION_FILES,
  HOME_FILES,
  KNOWN_UPDATE_KINDS,
  isKnownUpdateKind,
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
  subagentSpawnOf,
  subagentFinishedOf,
  taskBackgroundedOf,
  taskCompletedOf,
  recapOf,
  HOOK_EVENT_NAMES,
  parseHookEventName,
  BUILTIN_TOOL_NAMES,
  type TailIo,
} from "./src/index.ts";
import { parseObj, str } from "./src/json.ts";

const HOME = grokHome(process.env, homedir(), join);
const SESSIONS = join(HOME, "sessions");

const TOOL_OUTCOME_SET = new Set<string>(TOOL_OUTCOMES);
const PERM_SET = new Set<string>(PERMISSION_DECISIONS);
const TURN_SET = new Set<string>(TURN_OUTCOMES);
const PHASE_SET = new Set<string>(PHASES as readonly string[]);
const KNOWN_EVENTS = new Set<string>(KNOWN_EVENT_TYPES as readonly string[]);

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
console.log(
  `catalog: ${KNOWN_EVENT_TYPES.length} event types · ${KNOWN_UPDATE_KINDS.length} update kinds · ${HOOK_EVENT_NAMES.length} hook events · ${BUILTIN_TOOL_NAMES.length} tools\n`,
);

// hooks alias smoke
for (const a of ["PreToolUse", "beforeShellExecution", "subagent_end", "Stop"]) {
  if (parseHookEventName(a) === null) fail(`hook alias ${a} not resolved`);
}
console.log(`hooks: ${HOOK_EVENT_NAMES.length} events, aliases resolve`);

{
  const raw = await Bun.file(join(HOME, HOME_FILES.activeSessions))
    .text()
    .catch(() => "");
  if (raw !== "") {
    const entries = parseActiveSessions(raw);
    let rawCount = -1;
    try {
      const arr: unknown = JSON.parse(raw);
      rawCount = Array.isArray(arr) ? arr.length : -1;
    } catch {
      // Torn write mid-read: tolerate, matching parseActiveSessions.
    }
    console.log(`active_sessions.json: ${entries.length}/${rawCount} entries parsed`);
    if (rawCount >= 0 && entries.length !== rawCount) fail("active_sessions entries dropped by parser");
  }
}

const eventTypes = new Map<string, number>();
const otherSubtypes = new Map<string, number>();
const orchSubtypes = new Map<string, number>();
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
let subagentSpawned = 0;
let subagentFinished = 0;
let taskBg = 0;
let taskDone = 0;

for (const s of sessions) {
  const summaryText = await Bun.file(join(s.dir, SESSION_FILES.summary))
    .text()
    .catch(() => "");
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
  // Brand-new sessions can briefly lack a generated title; only fail if both
  // identity fields are empty after we already parsed the file.
  if (summary.modelId === "?" && summary.title === "") {
    console.log(`  · ${s.id}: summary still untitled/unknown model (tolerated for fresh sessions)`);
  }

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
    if (ev.type === "orchestration") tally(orchSubtypes, ev.subtype);
    if (ev.type === "mcp") tally(mcpSubtypes, ev.subtype);
    if (raw === null) continue;
    const rawType = str(raw["type"]);
    if (rawType === "phase_changed" && !PHASE_SET.has(str(raw["phase"]))) {
      fail(`${s.id}: unknown phase ${str(raw["phase"])}`);
    }
    if (rawType === "tool_completed" && !TOOL_OUTCOME_SET.has(str(raw["outcome"]))) {
      fail(`${s.id}: unknown tool outcome ${str(raw["outcome"])}`);
    }
    if (rawType === "permission_resolved" && !PERM_SET.has(str(raw["decision"]))) {
      fail(`${s.id}: unknown permission decision ${str(raw["decision"])}`);
    }
    if (rawType === "turn_ended" && !TURN_SET.has(str(raw["outcome"]))) {
      fail(`${s.id}: unknown turn outcome ${str(raw["outcome"])}`);
    }
    if (rawType === "turn_started" && ev.type === "turn_started" && ev.sessionId !== s.id) {
      fail(`${s.id}: turn_started session_id mismatch`);
    }
    // Known types should not land in other
    if (ev.type === "other" && KNOWN_EVENTS.has(ev.subtype)) {
      fail(`${s.id}: known event ${ev.subtype} classified as other`);
    }
  }

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
    if (env.kind === "session_recap" && recapOf(env.update) === null) {
      fail(`${s.id}: session_recap not extractable`);
    }
    if (env.kind === "subagent_spawned") {
      subagentSpawned += 1;
      if (subagentSpawnOf(env.update) === null) fail(`${s.id}: subagent_spawned not extractable`);
    }
    if (env.kind === "subagent_finished") {
      subagentFinished += 1;
      if (subagentFinishedOf(env.update) === null) fail(`${s.id}: subagent_finished not extractable`);
    }
    if (env.kind === "task_backgrounded") {
      taskBg += 1;
      if (taskBackgroundedOf(env.update) === null) fail(`${s.id}: task_backgrounded not extractable`);
    }
    if (env.kind === "task_completed") {
      taskDone += 1;
      if (taskCompletedOf(env.update) === null) fail(`${s.id}: task_completed not extractable`);
    }
  }

  for (const line of await lines(join(s.dir, SESSION_FILES.hunkRecords))) {
    hunkLines += 1;
    if (parseHunkLine(line) === null) {
      hunkNulls += 1;
      fail(`${s.id}: hunk line rejected: ${line.slice(0, 90)}`);
    }
  }
}

// Tail equivalence under 1KB short reads
{
  const target = sessions.map((s) => join(s.dir, SESSION_FILES.events)).find(() => true);
  if (target !== undefined && (await exists(target))) {
    const direct = await lines(target);
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
      // "Identical" must mean contents, not just counts.
      const diverged = collected.findIndex((l, i) => l !== (direct[i] ?? "").trim());
      if (diverged >= 0) {
        fail(`Tail equivalence: line ${diverged} differs between drip-feed and direct read`);
      } else {
        console.log(`tail: ${collected.length} lines identical via 1 KB drip-feed reads`);
      }
    }
  }
}

const show = (label: string, map: Map<string, number>): void => {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const parts = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`);
  console.log(`${label} (${total}): ${parts.join("  ") || "—"}`);
};

console.log(`\nevents.jsonl: ${eventLines} lines, ${eventNulls} rejected`);
show("  modeled types", eventTypes);
show("  → orchestration subtypes", orchSubtypes);
show("  → other subtypes", otherSubtypes);
show("  → mcp subtypes", mcpSubtypes);
console.log(`\nupdates.jsonl: ${updateLines} lines, ${updateNulls} rejected`);
show("  kinds", updateKinds);
const unmodeled = [...updateKinds.keys()].filter((k) => !isKnownUpdateKind(k));
if (unmodeled.length > 0) {
  console.log(`  ⚠ kinds not in KNOWN_UPDATE_KINDS: ${unmodeled.join(", ")}`);
  for (const k of unmodeled) fail(`unmodeled update kind on wire: ${k}`);
}
console.log(`  tool_call with x.ai/tool meta: ${toolCallsWithMeta}/${toolCalls}`);
console.log(`  turn_completed with usage parsed: ${turnUsageParsed}/${turnCompleted}`);
console.log(`  chunks with text: ${chunksWithText}/${chunks}`);
console.log(
  `  subagent spawn/finish: ${subagentSpawned}/${subagentFinished} · tasks bg/done: ${taskBg}/${taskDone}`,
);
console.log(`\nhunk_records.jsonl: ${hunkLines} lines, ${hunkNulls} rejected`);

console.log(hardFailures === 0 ? "\n✅ conformance clean" : `\n❌ ${hardFailures} hard failure(s)`);
process.exit(hardFailures === 0 ? 0 : 1);

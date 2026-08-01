// Live Grok Build session telemetry, by tailing what the agent writes to
// disk under ~/.grok — no cooperation from the agent process required.
//
// All grok interface knowledge (file layout, line schemas, semantics
// gotchas) lives in the shared packages/grok-harness package; this collector
// only folds those parsed surfaces into grokmeter's AgentSnapshot.

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  HOME_FILES,
  SESSION_FILES,
  SESSION_ID_RE,
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
  sessionDir,
  sessionsRoot,
  summarizeRawInput,
  toolMetaOf,
  type ActiveSessionEntry,
  type TailIo,
} from "../../../../packages/grok-harness/src/index.ts";
import type { AgentPhase, AgentSnapshot, CollectorEmit, FeedItem, FleetEntry, ToolStats } from "../shared/protocol.ts";

type Emit = Pick<CollectorEmit, "agent" | "feed" | "fleet">;

export type GrokHandle = {
  /** Focus a watched session by id (from a fleet row click). */
  setFocus: (id: string) => void;
};

const home = (): string => grokHome(process.env, homedir(), join);

/** Bun-backed IO for the shared Tail (byte-oriented per the contract). */
const BUN_IO: TailIo = {
  stat: async (path) => {
    try {
      const st = await stat(path);
      return { size: st.size, id: `${st.dev}:${st.ino}` };
    } catch {
      return null;
    }
  },
  read: async (path, start, end) => new Uint8Array(await Bun.file(path).slice(start, end).arrayBuffer()),
};

async function readText(path: string): Promise<string> {
  return Bun.file(path)
    .text()
    .catch(() => "");
}

// ── Session watcher ──────────────────────────────────────────────────────

class SessionWatch {
  readonly events: Tail;
  readonly updates: Tail;
  readonly hunks: Tail;

  // Folded state.
  phase: AgentPhase = "idle";
  turnCount = 0;
  userMessages = 0;
  assistantMessages = 0;
  toolFailureCount = 0;
  errorCount = 0;
  tools: Record<string, ToolStats> = {};
  permsRequested = 0;
  permsDenied = 0;
  permWaitTotal = 0;
  permPending = false;
  /** Live context occupancy: latest totalTokens observed on the stream. */
  contextUsedTokens = 0;
  /** Session high-water token mark (the odometer). */
  totalTokens = 0;
  ttft: number[] = [];
  turnStartedAt = 0;
  hunkTotals = new Map<string, { add: number; rem: number; file: string }>();
  lastThoughtAt = 0;
  lastMessageAt = 0;
  lastUserPrompt = "";
  toolDetail = new Map<string, { detail: string; at: number }>();

  // From summary/signals.
  title = "";
  model = "";
  agentName = "grok";
  reasoningEffort = "";
  sandbox = "";
  gitBranch = "";
  gitCommit = "";
  createdAt = Date.now();
  updatedAt = Date.now();
  contextWindowTokens = 0;
  compactionCount = 0;
  itlP50 = 0;
  itlP99 = 0;

  /** Recent feed items for this session, kept so focus switches can backfill. */
  readonly ring: FeedItem[] = [];

  readonly dir: string;
  readonly id: string;
  readonly cwd: string;

  constructor(dir: string, id: string, cwd: string) {
    this.dir = dir;
    this.id = id;
    this.cwd = cwd;
    this.events = new Tail(BUN_IO, join(dir, SESSION_FILES.events), false);
    this.updates = new Tail(BUN_IO, join(dir, SESSION_FILES.updates), true);
    this.hunks = new Tail(BUN_IO, join(dir, SESSION_FILES.hunkRecords), false);
  }

  async refreshMeta(): Promise<void> {
    const summary = parseSummary(await readText(join(this.dir, SESSION_FILES.summary)));
    if (summary !== null) {
      this.title = summary.title;
      this.model = summary.modelId;
      this.agentName = summary.agentName;
      this.reasoningEffort = summary.reasoningEffort;
      this.sandbox = summary.sandboxProfile;
      this.gitBranch = summary.gitBranch;
      this.gitCommit = summary.gitCommit;
      if (summary.createdAt > 0) this.createdAt = summary.createdAt;
      if (summary.lastActiveAt > 0) this.updatedAt = summary.lastActiveAt;
    }
    const signals = parseSignals(await readText(join(this.dir, SESSION_FILES.signals)));
    if (signals !== null) {
      // signals.json can lag the live stream by hours: it only seeds the
      // counters before the first stream observation (window size and ITL
      // percentiles are the slow-moving values we actually want from it).
      this.contextWindowTokens = signals.contextWindowTokens > 0 ? signals.contextWindowTokens : this.contextWindowTokens;
      // Slow-moving fields are null when signals.json omits them: keep the
      // prior observation in that case (a real zero is applied as-is).
      if (signals.compactionCount !== null) this.compactionCount = signals.compactionCount;
      if (signals.itlP50Ms !== null) this.itlP50 = signals.itlP50Ms;
      if (signals.itlP99Ms !== null) this.itlP99 = signals.itlP99Ms;
      this.errorCount = Math.max(this.errorCount, signals.errorCount);
      if (this.contextUsedTokens === 0) this.contextUsedTokens = signals.contextTokensUsed;
      if (this.totalTokens === 0) this.totalTokens = signals.contextTokensUsed;
    }
  }

  foldEvent(line: string, feed: FeedItem[]): void {
    const ev = parseEventLine(line);
    if (ev === null) return;

    switch (ev.type) {
      case "turn_started": {
        this.turnCount = Math.max(this.turnCount, ev.turnNumber + 1);
        this.turnStartedAt = ev.at;
        feed.push({ at: ev.at, kind: "turn", text: `turn ${ev.turnNumber + 1} · ${ev.modelId || "?"}` });
        break;
      }
      case "phase_changed": {
        this.phase = ev.phase;
        break;
      }
      case "first_token": {
        if (this.turnStartedAt > 0) {
          this.ttft.push(ev.at - this.turnStartedAt);
          if (this.ttft.length > 200) this.ttft.shift();
          this.turnStartedAt = 0;
        }
        break;
      }
      case "tool_completed": {
        const ok = ev.outcome === "success";
        // Only genuine tool failures count as failures: permission denials,
        // cancellations, and followups are user decisions or continuations,
        // not the tool breaking.
        const failed = ev.outcome === "error" || ev.outcome === "invalid_tool" || ev.outcome === "hook_denied";
        const cur = this.tools[ev.toolName] ?? { count: 0, failures: 0, totalMs: 0 };
        cur.count += 1;
        cur.totalMs += ev.durationMs;
        if (failed) {
          cur.failures += 1;
          this.toolFailureCount += 1;
        }
        this.tools[ev.toolName] = cur;
        feed.push({
          at: ev.at,
          kind: "tool_end",
          text: ok ? "ok" : ev.outcome.replace(/_/g, " "),
          tool: ev.toolName,
          ok,
          ms: ev.durationMs,
        });
        break;
      }
      case "permission_requested": {
        this.permsRequested += 1;
        this.permPending = true;
        const detail = this.toolDetail.get(ev.toolName);
        feed.push({
          at: ev.at,
          kind: "perm_req",
          text: detail !== undefined && ev.at - detail.at < 8000 ? detail.detail : "awaiting approval",
          tool: ev.toolName,
        });
        break;
      }
      case "permission_resolved": {
        this.permPending = false;
        this.permWaitTotal += ev.waitMs;
        if (ev.decision === "deny") this.permsDenied += 1;
        if (ev.waitMs > 100) {
          feed.push({
            at: ev.at,
            kind: "perm_res",
            text: ev.decision,
            tool: ev.toolName,
            ok: ev.decision === "allow",
          });
        }
        break;
      }
      case "turn_ended": {
        feed.push({ at: ev.at, kind: "turn", text: `turn ${this.turnCount} ${ev.outcome}` });
        if (ev.outcome === "error") this.errorCount += 1;
        break;
      }
      case "mcp": {
        if (ev.subtype === "mcp_server_connected") {
          feed.push({ at: ev.at, kind: "mcp", text: `mcp ${ev.serverName ?? "?"} connected` });
        } else if (ev.subtype === "mcp_server_failed") {
          feed.push({ at: ev.at, kind: "error", text: `mcp ${ev.serverName ?? "?"} failed` });
        }
        break;
      }
      default:
        break;
    }
  }

  foldUpdate(line: string, feed: FeedItem[]): void {
    const env = parseUpdateLine(line);
    if (env === null) return;
    // Prefer the agent's own millisecond stamp, then the envelope write
    // time; never invent "now" for a replayed line.
    const at = env.agentTimestampMs ?? (env.timestamp > 0 ? env.timestamp * 1000 : Date.now());

    if (env.totalTokens !== null && env.totalTokens >= 0) {
      // Context occupancy tracks the stream (down too, e.g. compaction);
      // the odometer only ratchets up.
      this.contextUsedTokens = env.totalTokens;
      if (env.totalTokens > this.totalTokens) this.totalTokens = env.totalTokens;
    }

    switch (env.kind) {
      case "tool_call": {
        const meta = toolMetaOf(env.update);
        const title = typeof env.update["title"] === "string" ? env.update["title"] : "?";
        const name = meta !== null ? meta.name : title;
        const detail = summarizeRawInput(env.update);
        const text = detail !== "" ? detail : title;
        this.toolDetail.set(name, { detail: text, at });
        feed.push({ at, kind: "tool_start", text, tool: name });
        break;
      }
      case "user_message_chunk": {
        const text = chunkText(env.update).trim();
        if (text !== "" && text !== this.lastUserPrompt) {
          this.lastUserPrompt = text;
          this.userMessages += 1;
          feed.push({ at, kind: "user", text: clip(text, 120) });
        }
        break;
      }
      case "agent_thought_chunk": {
        if (at - this.lastThoughtAt < 2500) break;
        this.lastThoughtAt = at;
        const text = chunkText(env.update).trim();
        if (text !== "") feed.push({ at, kind: "thought", text: clip(text, 120) });
        break;
      }
      case "agent_message_chunk": {
        if (at - this.lastMessageAt >= 2500) {
          const text = chunkText(env.update).trim();
          // An empty chunk shouldn't open (and count) a message burst.
          if (text !== "") {
            this.assistantMessages += 1;
            feed.push({ at, kind: "message", text: clip(text, 120) });
            this.lastMessageAt = at;
          }
          break;
        }
        this.lastMessageAt = at;
        break;
      }
      default:
        break;
    }
  }

  foldHunk(line: string): void {
    const rec = parseHunkLine(line);
    if (rec === null || rec.authorType !== "agent") return;
    this.hunkTotals.set(rec.hunkId, { add: rec.linesAdded, rem: rec.linesRemoved, file: rec.filePath });
  }

  snapshot(live: boolean): AgentSnapshot {
    let linesAdded = 0;
    let linesRemoved = 0;
    const files = new Set<string>();
    for (const h of this.hunkTotals.values()) {
      linesAdded += h.add;
      linesRemoved += h.rem;
      files.add(h.file);
    }
    const toolCallCount = Object.values(this.tools).reduce((a, t) => a + t.count, 0);
    const ttftAvg = this.ttft.length > 0 ? this.ttft.reduce((a, b) => a + b, 0) / this.ttft.length : 0;
    const ttftMin = this.ttft.reduce((a, b) => Math.min(a, b), this.ttft[0] ?? 0);
    const ttftMax = this.ttft.reduce((a, b) => Math.max(a, b), 0);
    return {
      id: this.id,
      title: this.title,
      cwd: this.cwd,
      model: this.model,
      agentName: this.agentName,
      reasoningEffort: this.reasoningEffort,
      sandbox: this.sandbox,
      live,
      startedAt: this.createdAt,
      // A live session is being updated right now; a disk-fallback session's
      // honest "last activity" is what summary.json recorded, not "now".
      updatedAt: live ? Date.now() : this.updatedAt,
      phase: this.permPending ? "permission_prompt" : this.phase,
      turnCount: this.turnCount,
      userMessages: this.userMessages,
      assistantMessages: this.assistantMessages,
      toolCallCount,
      toolFailureCount: this.toolFailureCount,
      errorCount: this.errorCount,
      compactionCount: this.compactionCount,
      durationSec: Math.max(0, Math.floor((Date.now() - this.createdAt) / 1000)),
      contextUsedTokens: this.contextUsedTokens,
      contextWindowTokens: this.contextWindowTokens,
      totalTokens: this.totalTokens,
      ttftAvgMs: ttftAvg,
      ttftMinMs: ttftMin,
      ttftMaxMs: ttftMax,
      itlP50Ms: this.itlP50,
      itlP99Ms: this.itlP99,
      linesAdded,
      linesRemoved,
      filesTouched: files.size,
      gitBranch: this.gitBranch,
      gitCommit: this.gitCommit,
      tools: this.tools,
      permsRequested: this.permsRequested,
      permsDenied: this.permsDenied,
      permAvgWaitMs: this.permsRequested > 0 ? this.permWaitTotal / this.permsRequested : 0,
      permPending: this.permPending,
    };
  }
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const RING_CAP = 60;

function pushRing(ring: FeedItem[], items: FeedItem[]): void {
  ring.push(...items);
  if (ring.length > RING_CAP) ring.splice(0, ring.length - RING_CAP);
}

// ── Discovery ────────────────────────────────────────────────────────────

async function readActive(): Promise<ActiveSessionEntry[]> {
  return parseActiveSessions(await readText(join(home(), HOME_FILES.activeSessions)));
}

function pidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function findSessionDir(cwd: string, id: string): Promise<string | null> {
  const direct = sessionDir(home(), cwd, id, join);
  // sessionDir returns null for invalid ids — never path-join raw ids.
  if (direct === null) return null;
  try {
    await stat(join(direct, SESSION_FILES.summary));
    return direct;
  } catch {
    // Fall through to a scan (encoding edge cases, e.g. >255-byte cwds).
  }
  const root = sessionsRoot(home(), join);
  try {
    for (const entry of await readdir(root)) {
      if (decodeCwdDirname(entry) !== cwd) continue;
      const dir = join(root, entry, id);
      try {
        await stat(join(dir, SESSION_FILES.summary));
        return dir;
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** The fallback scan readdirs every cwd bucket and stats every summary —
 * hundreds of syscalls. The answer rarely changes while idle, and idle is
 * where the deck lives, so cache it briefly. */
let recentScanCache: { at: number; value: { dir: string; id: string; cwd: string } | null } = {
  at: 0,
  value: null,
};
const RECENT_SCAN_TTL_MS = 15_000;

/** Most recently touched session on disk, for when nothing is live. */
async function findRecentSession(): Promise<{ dir: string; id: string; cwd: string } | null> {
  if (Date.now() - recentScanCache.at < RECENT_SCAN_TTL_MS) return recentScanCache.value;
  const root = sessionsRoot(home(), join);
  let best: { dir: string; id: string; cwd: string; mtime: number } | null = null;
  let cwdDirs: string[] = [];
  try {
    cwdDirs = await readdir(root);
  } catch {
    return null;
  }
  for (const cwdDir of cwdDirs) {
    const decoded = decodeCwdDirname(cwdDir);
    if (decoded === null) continue;
    const base = join(root, cwdDir);
    let ids: string[] = [];
    try {
      ids = await readdir(base);
    } catch {
      continue;
    }
    for (const id of ids) {
      // `base` is authoritative here (long cwds encode differently on disk);
      // the id just has to be a valid session id before any path join.
      if (!SESSION_ID_RE.test(id)) continue;
      try {
        const s = await stat(join(base, id, SESSION_FILES.summary));
        if (best === null || s.mtimeMs > best.mtime) {
          best = { dir: join(base, id), id, cwd: decoded, mtime: s.mtimeMs };
        }
      } catch {
        continue;
      }
    }
  }
  const value = best === null ? null : { dir: best.dir, id: best.id, cwd: best.cwd };
  recentScanCache = { at: Date.now(), value };
  return value;
}

// ── Public entry ─────────────────────────────────────────────────────────

const MAX_WATCHES = 8;

/**
 * Watch EVERY live session concurrently (capped at MAX_WATCHES, freshest
 * event files win). All watchers fold state and keep a feed ring; only the
 * focused session streams to the deck's agent widgets. Focus is sticky —
 * it never auto-switches while the focused session stays watched, so two
 * busy sessions can't make the deck flap.
 */
export function startGrok(emit: Emit): GrokHandle {
  const watches = new Map<string, { watch: SessionWatch; live: boolean }>();
  let focusedId: string | null = null;

  const focused = (): { watch: SessionWatch; live: boolean } | null =>
    focusedId !== null ? (watches.get(focusedId) ?? null) : null;

  const emitFocus = (entry: { watch: SessionWatch; live: boolean }): void => {
    const w = entry.watch;
    emit.feed([
      {
        at: Date.now(),
        kind: "phase",
        text: `▶ focused ${w.id.slice(0, 8)} · ${w.cwd.split("/").pop() ?? w.cwd}`,
      },
      ...w.ring.slice(-30),
    ]);
    emit.agent(w.snapshot(entry.live));
  };

  const emitFleet = (): void => {
    const fleet: FleetEntry[] = [...watches.values()]
      .map(({ watch: w, live }) => ({
        id: w.id,
        title: w.title,
        cwd: w.cwd,
        model: w.model,
        phase: (w.permPending ? "permission_prompt" : w.phase) as AgentPhase,
        live,
        focused: w.id === focusedId,
        permPending: w.permPending,
        contextUsedTokens: w.contextUsedTokens,
        contextWindowTokens: w.contextWindowTokens,
        toolCallCount: Object.values(w.tools).reduce((a, t) => a + t.count, 0),
        // Same rule as snapshot(): live sessions are being updated now; only
        // disk-fallback rows report the recorded last-active time.
        updatedAt: live ? Date.now() : w.updatedAt,
      }))
      .sort((a, b) => a.cwd.localeCompare(b.cwd) || a.id.localeCompare(b.id));
    emit.fleet(fleet);
  };

  const attach = async (dir: string, id: string, cwd: string, live: boolean): Promise<void> => {
    const fresh = new SessionWatch(dir, id, cwd);
    await fresh.refreshMeta();
    // Replay to rebuild counters; the tail lands in the ring, not the feed.
    const backfill: FeedItem[] = [];
    await fresh.events.poll((line) => fresh.foldEvent(line, backfill));
    await fresh.updates.poll((line) => fresh.foldUpdate(line, backfill));
    await fresh.hunks.poll((line) => fresh.foldHunk(line));
    backfill.sort((a, b) => a.at - b.at);
    pushRing(fresh.ring, backfill);
    watches.set(id, { watch: fresh, live });
  };

  // Discovery: keep a watcher per live session; fall back to the most
  // recently active on-disk session when nothing is running.
  const discover = async (): Promise<void> => {
    const active = (await readActive()).filter((a) => pidAlive(a.pid));
    const targets = new Map<string, { dir: string; cwd: string; live: boolean; mtime: number }>();

    for (const a of active) {
      const dir = await findSessionDir(a.cwd, a.sessionId);
      if (dir === null) continue;
      let mtime = 0;
      try {
        mtime = (await stat(join(dir, SESSION_FILES.events))).mtimeMs;
      } catch {
        mtime = 0;
      }
      targets.set(a.sessionId, { dir, cwd: a.cwd, live: true, mtime });
    }
    if (targets.size === 0) {
      const recent = await findRecentSession();
      if (recent !== null) targets.set(recent.id, { dir: recent.dir, cwd: recent.cwd, live: false, mtime: 0 });
    }

    // Cap by activity.
    const keep = new Set(
      [...targets.entries()]
        .sort((a, b) => b[1].mtime - a[1].mtime)
        .slice(0, MAX_WATCHES)
        .map(([id]) => id),
    );

    for (const id of [...watches.keys()]) {
      if (!keep.has(id)) watches.delete(id);
    }
    for (const id of keep) {
      const t = targets.get(id);
      if (t === undefined) continue;
      const existing = watches.get(id);
      if (existing === undefined) {
        await attach(t.dir, id, t.cwd, t.live);
      } else {
        existing.live = t.live;
      }
    }

    // Sticky focus: only (re)pick when the focused session vanished.
    if (focusedId === null || !watches.has(focusedId)) {
      const preferred =
        [...targets.entries()]
          .filter(([id]) => watches.has(id))
          .sort((a, b) => Number(b[1].live) - Number(a[1].live) || b[1].mtime - a[1].mtime)
          .map(([id]) => id)[0] ?? null;
      focusedId = preferred;
      const entry = focused();
      if (entry !== null) emitFocus(entry);
      else emit.agent(null);
    }
    emitFleet();
  };

  // Both loop bodies are async on fixed timers: an in-flight latch keeps a
  // slow poll from re-entering Tail.poll and double-folding a byte range.
  let discovering = false;
  const discoverOnce = (): void => {
    if (discovering) return;
    discovering = true;
    void discover()
      .catch(() => {
        // A transient FS race must cost one tick, never the process:
        // unhandled rejections are fatal under Bun.
      })
      .finally(() => {
        discovering = false;
      });
  };
  discoverOnce();
  setInterval(discoverOnce, 2000);

  // Tail loop: poll every watcher; stream only the focused one.
  let tailing = false;
  setInterval(() => {
    if (tailing) return;
    tailing = true;
    void (async () => {
      for (const entry of watches.values()) {
        const w = entry.watch;
        const fresh: FeedItem[] = [];
        await w.updates.poll((line) => w.foldUpdate(line, fresh));
        await w.events.poll((line) => w.foldEvent(line, fresh));
        await w.hunks.poll((line) => w.foldHunk(line));
        if (w.events.truncated || w.updates.truncated || w.hunks.truncated) {
          // A source file shrank (rewind/rotation): counters folded from it
          // are stale, so rebuild this watch instead of folding a replay
          // into already-populated state.
          watches.delete(w.id);
          await attach(w.dir, w.id, w.cwd, entry.live);
          if (w.id === focusedId) {
            const rebuilt = watches.get(w.id);
            if (rebuilt !== undefined) emitFocus(rebuilt);
          }
          continue;
        }
        if (fresh.length === 0) continue;
        fresh.sort((a, b) => a.at - b.at);
        pushRing(w.ring, fresh);
        if (w.id === focusedId) emit.feed(fresh);
      }
      const entry = focused();
      if (entry !== null) emit.agent(entry.watch.snapshot(entry.live));
      emitFleet();
    })()
      .catch(() => {
        // Skip the tick on a transient FS race; never surface an unhandled
        // rejection from a timer body.
      })
      .finally(() => {
        tailing = false;
      });
  }, 900);

  // Meta refresh (summary/signals are small atomic files).
  setInterval(() => {
    for (const { watch } of watches.values()) void watch.refreshMeta().catch(() => {});
  }, 3000);

  return {
    setFocus: (id: string): void => {
      const entry = watches.get(id);
      if (entry === undefined || id === focusedId) return;
      focusedId = id;
      emitFocus(entry);
      emitFleet();
    },
  };
}

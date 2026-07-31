// Live Grok Build session telemetry, by tailing what the agent writes to
// disk under ~/.grok — no cooperation from the agent process required.
//
//   active_sessions.json          → which sessions are alive (pid, cwd)
//   sessions/<cwd>/<id>/
//     summary.json                → identity: title, model, git, timestamps
//     signals.json                → slow extras: context window size, ITL
//     events.jsonl    (tail)      → phases, tools, permissions, turns, TTFT
//     updates.jsonl   (tail)      → tool detail, message text, token counter
//     hunk_records.jsonl (tail)   → agent line churn
//
// Appends can tear the final line (healed on next append), and the small
// JSON files are atomically replaced — so we buffer partial tails, re-stat
// by path, and skip anything unparseable.

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { num, parseObj, str, sub, type JObj } from "./jsonx.ts";
import type { AgentPhase, AgentSnapshot, CollectorEmit, FeedItem, ToolStats } from "../shared/protocol.ts";

type Emit = Pick<CollectorEmit, "agent" | "feed">;

const grokHome = (): string => process.env["GROK_HOME"] ?? join(homedir(), ".grok");

/** Session ids are UUIDs; anything else must not reach a path join. */
const SESSION_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

// ── Byte-offset line tail with torn-line tolerance ───────────────────────
// Byte-oriented on purpose: offsets always count BYTES (stat/slice space),
// never decoded characters — a UTF-16 length would drift past the first
// non-ASCII byte — and only complete lines are decoded, so a multi-byte
// character split across a poll boundary can't be corrupted.

const NEWLINE = 0x0a;
const BACKFILL_BYTES = 128 * 1024;
/** Per-read ceiling: bounds peak memory when replaying a large log. The
 * inner loop below keeps reading until caught up, so semantics per poll()
 * are unchanged. */
const READ_CAP_BYTES = 4 * 1024 * 1024;

async function readBytes(path: string, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(path).slice(start, end).arrayBuffer());
}

class Tail {
  /** Set when the file shrank underneath us (rewind/rotation). The owner
   * must rebuild any state folded from this file — the tail itself resumes
   * per its mode, but counters folded before the truncation are stale. */
  truncated = false;

  private readonly path: string;
  private readonly startAtEnd: boolean;
  private offset: number;
  private buf = new Uint8Array(0);

  constructor(path: string, startAtEnd: boolean) {
    this.path = path;
    this.startAtEnd = startAtEnd;
    this.offset = startAtEnd ? -1 : 0; // -1: resolve near EOF on first poll
  }

  async poll(onLine: (line: string) => void): Promise<void> {
    // Files can be replaced between the stat and the read; that must cost
    // one tick, never an unhandled rejection in the caller's timer.
    try {
      await this.pollInner(onLine);
    } catch {
      // Transient disk race; state only advances after successful reads.
    }
  }

  private async pollInner(onLine: (line: string) => void): Promise<void> {
    let size: number;
    try {
      size = (await stat(this.path)).size;
    } catch {
      return;
    }
    if (this.offset === -1) {
      // First contact: start 128 KB back so the deck has recent history,
      // probing forward to a line boundary so we never start mid-line.
      this.offset = Math.max(0, size - BACKFILL_BYTES);
      if (this.offset > 0) {
        while (this.offset < size) {
          const probe = await readBytes(this.path, this.offset, size);
          if (probe.length === 0) break;
          const nl = probe.indexOf(NEWLINE);
          if (nl >= 0) {
            this.offset += nl + 1;
            break;
          }
          this.offset += probe.length;
        }
      }
    }
    if (size < this.offset) {
      // Truncated or rotated: return to this tail's own mode (a
      // start-at-end tail must not replay the whole replacement file) and
      // flag the owner to rebuild folded state.
      this.truncated = true;
      this.offset = this.startAtEnd ? -1 : 0;
      this.buf = new Uint8Array(0);
      if (this.offset === -1) {
        await this.pollInner(onLine);
        return;
      }
    }

    while (this.offset < size) {
      const end = Math.min(size, this.offset + READ_CAP_BYTES);
      const chunk = await readBytes(this.path, this.offset, end);
      if (chunk.length === 0) return;
      this.offset += chunk.length;

      const joined = new Uint8Array(this.buf.length + chunk.length);
      joined.set(this.buf, 0);
      joined.set(chunk, this.buf.length);
      this.buf = joined;

      const decoder = new TextDecoder();
      let start = 0;
      let nl = this.buf.indexOf(NEWLINE, start);
      while (nl >= 0) {
        const line = decoder.decode(this.buf.slice(start, nl)).trim();
        if (line !== "") onLine(line);
        start = nl + 1;
        nl = this.buf.indexOf(NEWLINE, start);
      }
      this.buf = this.buf.slice(start);
    }
  }
}

// ── Session watcher ──────────────────────────────────────────────────────

type ActiveEntry = { sessionId: string; pid: number; cwd: string };

const PHASES: readonly AgentPhase[] = [
  "idle",
  "waiting_for_model",
  "streaming_reasoning",
  "streaming_text",
  "tool_execution",
  "permission_prompt",
];

function asPhase(v: string): AgentPhase {
  return (PHASES as readonly string[]).includes(v) ? (v as AgentPhase) : "idle";
}

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

  readonly dir: string;
  readonly id: string;
  readonly cwd: string;

  constructor(dir: string, id: string, cwd: string) {
    this.dir = dir;
    this.id = id;
    this.cwd = cwd;
    this.events = new Tail(join(dir, "events.jsonl"), false);
    this.updates = new Tail(join(dir, "updates.jsonl"), true);
    this.hunks = new Tail(join(dir, "hunk_records.jsonl"), false);
  }

  async refreshMeta(): Promise<void> {
    const summary = parseObj(await Bun.file(join(this.dir, "summary.json")).text().catch(() => ""));
    if (summary !== null) {
      this.title = str(summary["generated_title"], str(summary["session_summary"], "untitled"));
      this.model = str(summary["current_model_id"], "?");
      this.agentName = str(summary["agent_name"], "grok");
      this.reasoningEffort = str(summary["reasoning_effort"], "");
      this.sandbox = str(summary["sandbox_profile"], "");
      this.gitBranch = str(summary["head_branch"], "");
      this.gitCommit = str(summary["head_commit"], "");
      const created = Date.parse(str(summary["created_at"], ""));
      if (Number.isFinite(created)) this.createdAt = created;
      const updated = Date.parse(str(summary["last_active_at"], str(summary["updated_at"], "")));
      if (Number.isFinite(updated)) this.updatedAt = updated;
    }
    const signals = parseObj(await Bun.file(join(this.dir, "signals.json")).text().catch(() => ""));
    if (signals !== null) {
      this.contextWindowTokens = num(signals["contextWindowTokens"], this.contextWindowTokens);
      this.compactionCount = num(signals["compactionCount"], this.compactionCount);
      this.itlP50 = num(signals["itlP50Ms"], this.itlP50);
      this.itlP99 = num(signals["itlP99Ms"], this.itlP99);
      this.errorCount = Math.max(this.errorCount, num(signals["errorCount"], 0));
      // signals.json can lag far behind the live stream, so it only seeds
      // the counters before the first updates.jsonl observation.
      if (this.contextUsedTokens === 0) {
        this.contextUsedTokens = num(signals["contextTokensUsed"], 0);
      }
      if (this.totalTokens === 0) this.totalTokens = num(signals["contextTokensUsed"], 0);
    }
  }

  foldEvent(line: string, feed: FeedItem[]): void {
    const ev = parseObj(line);
    if (ev === null) return;
    const type = str(ev["type"]);
    const at = Date.parse(str(ev["ts"])) || Date.now();

    switch (type) {
      case "turn_started": {
        this.turnCount = Math.max(this.turnCount, num(ev["turn_number"]) + 1);
        this.turnStartedAt = at;
        feed.push({ at, kind: "turn", text: `turn ${num(ev["turn_number"]) + 1} · ${str(ev["model_id"], "?")}` });
        break;
      }
      case "phase_changed": {
        this.phase = asPhase(str(ev["phase"]));
        break;
      }
      case "first_token": {
        if (this.turnStartedAt > 0) {
          this.ttft.push(at - this.turnStartedAt);
          if (this.ttft.length > 200) this.ttft.shift();
          this.turnStartedAt = 0;
        }
        break;
      }
      case "tool_completed": {
        const name = str(ev["tool_name"], "?");
        const ms = num(ev["duration_ms"]);
        const outcome = str(ev["outcome"], "success");
        const ok = outcome === "success";
        const cur = this.tools[name] ?? { count: 0, failures: 0, totalMs: 0 };
        cur.count += 1;
        cur.totalMs += ms;
        if (!ok) {
          cur.failures += 1;
          this.toolFailureCount += 1;
        }
        this.tools[name] = cur;
        feed.push({ at, kind: "tool_end", text: ok ? "ok" : outcome.replace(/_/g, " "), tool: name, ok, ms });
        break;
      }
      case "permission_requested": {
        const name = str(ev["tool_name"], "?");
        this.permsRequested += 1;
        this.permPending = true;
        const detail = this.toolDetail.get(name);
        feed.push({
          at,
          kind: "perm_req",
          text: detail !== undefined && at - detail.at < 8000 ? detail.detail : "awaiting approval",
          tool: name,
        });
        break;
      }
      case "permission_resolved": {
        const decision = str(ev["decision"], "allow");
        this.permPending = false;
        this.permWaitTotal += num(ev["wait_ms"]);
        if (decision === "deny") this.permsDenied += 1;
        if (num(ev["wait_ms"]) > 100) {
          feed.push({ at, kind: "perm_res", text: decision, tool: str(ev["tool_name"], "?"), ok: decision === "allow" });
        }
        break;
      }
      case "turn_ended": {
        const outcome = str(ev["outcome"], "completed");
        feed.push({ at, kind: "turn", text: `turn ${this.turnCount} ${outcome}` });
        if (outcome === "error") this.errorCount += 1;
        break;
      }
      case "mcp_server_connected":
        feed.push({ at, kind: "mcp", text: `mcp ${str(ev["server_name"], "?")} connected` });
        break;
      case "mcp_server_failed":
        feed.push({ at, kind: "error", text: `mcp ${str(ev["server_name"], "?")} failed` });
        break;
      default:
        break;
    }
  }

  foldUpdate(line: string, feed: FeedItem[]): void {
    const envelope = parseObj(line);
    if (envelope === null) return;
    const params = sub(envelope["params"]);
    if (params === null) return;
    const update = sub(params["update"]);
    if (update === null) return;
    const meta = sub(params["_meta"]);
    const at = meta !== null ? num(meta["agentTimestampMs"], Date.now()) : Date.now();
    const kind = str(update["sessionUpdate"]);

    if (meta !== null) {
      const tokens = num(meta["totalTokens"], -1);
      if (tokens >= 0) {
        // Context occupancy tracks the stream (down too, e.g. compaction);
        // the odometer only ratchets up.
        this.contextUsedTokens = tokens;
        if (tokens > this.totalTokens) this.totalTokens = tokens;
      }
    }

    switch (kind) {
      case "tool_call": {
        const rawInput = sub(update["rawInput"]);
        const toolMeta = sub(sub(update["_meta"])?.["x.ai/tool"] ?? null);
        const name = toolMeta !== null ? str(toolMeta["name"], str(update["title"], "?")) : str(update["title"], "?");
        const detail = rawInput !== null ? summarizeInput(rawInput) : "";
        const text = detail !== "" ? detail : str(update["title"], name);
        this.toolDetail.set(name, { detail: text, at });
        feed.push({ at, kind: "tool_start", text, tool: name });
        break;
      }
      case "user_message_chunk": {
        const content = sub(update["content"]);
        const text = content !== null ? str(content["text"]) : "";
        if (text.trim() !== "" && text.trim() !== this.lastUserPrompt) {
          this.lastUserPrompt = text.trim();
          this.userMessages += 1;
          feed.push({ at, kind: "user", text: clip(text, 120) });
        }
        break;
      }
      case "agent_thought_chunk": {
        if (at - this.lastThoughtAt < 2500) break;
        this.lastThoughtAt = at;
        const content = sub(update["content"]);
        const text = content !== null ? str(content["text"]) : "";
        if (text.trim() !== "") feed.push({ at, kind: "thought", text: clip(text, 120) });
        break;
      }
      case "agent_message_chunk": {
        if (at - this.lastMessageAt >= 2500) {
          this.assistantMessages += 1;
          const content = sub(update["content"]);
          const text = content !== null ? str(content["text"]) : "";
          if (text.trim() !== "") feed.push({ at, kind: "message", text: clip(text, 120) });
        }
        this.lastMessageAt = at;
        break;
      }
      default:
        break;
    }
  }

  foldHunk(line: string): void {
    const rec = parseObj(line);
    if (rec === null) return;
    if (str(rec["authorType"]) !== "agent") return;
    const id = str(rec["hunkId"]);
    if (id === "") return;
    this.hunkTotals.set(id, {
      add: num(rec["linesAdded"]),
      rem: num(rec["linesRemoved"]),
      file: str(rec["filePath"]),
    });
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

function summarizeInput(raw: JObj): string {
  for (const key of ["command", "pattern", "file_path", "path", "query", "url", "prompt", "description"]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim() !== "") return clip(v, 110);
  }
  return "";
}

// ── Discovery ────────────────────────────────────────────────────────────

async function readActiveSessions(): Promise<ActiveEntry[]> {
  const parsedText = await Bun.file(join(grokHome(), "active_sessions.json")).text().catch(() => "");
  try {
    const arr: unknown = JSON.parse(parsedText);
    if (!Array.isArray(arr)) return [];
    const out: ActiveEntry[] = [];
    for (const item of arr) {
      if (typeof item !== "object" || item === null) continue;
      const o = item as JObj;
      const sessionId = str(o["session_id"]);
      const cwd = str(o["cwd"]);
      // cwd must be an absolute path: a relative value (even "..") would
      // otherwise flow into a path join under the sessions root.
      if (!SESSION_ID_RE.test(sessionId) || !cwd.startsWith("/")) continue;
      out.push({ sessionId, pid: num(o["pid"]), cwd });
    }
    return out;
  } catch {
    return [];
  }
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

async function findSessionDir(cwd: string, sessionId: string): Promise<string | null> {
  if (!SESSION_ID_RE.test(sessionId)) return null;
  const root = join(grokHome(), "sessions");
  const direct = join(root, encodeURIComponent(cwd), sessionId);
  try {
    await stat(join(direct, "summary.json"));
    return direct;
  } catch {
    // Fall through to a scan (encoding edge cases, e.g. >255-byte cwds).
  }
  try {
    for (const entry of await readdir(root)) {
      let decoded = "";
      try {
        decoded = decodeURIComponent(entry);
      } catch {
        continue;
      }
      if (decoded !== cwd) continue;
      const dir = join(root, entry, sessionId);
      try {
        await stat(join(dir, "summary.json"));
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

/** Most recently touched session on disk, for when nothing is live. */
/** The fallback scan readdirs every cwd bucket and stats every summary —
 * hundreds of syscalls. The answer rarely changes while idle, and idle is
 * where the deck lives, so cache it briefly. */
let recentScanCache: { at: number; value: { dir: string; id: string; cwd: string } | null } = {
  at: 0,
  value: null,
};
const RECENT_SCAN_TTL_MS = 15_000;

async function findRecentSession(): Promise<{ dir: string; id: string; cwd: string } | null> {
  if (Date.now() - recentScanCache.at < RECENT_SCAN_TTL_MS) return recentScanCache.value;
  const root = join(grokHome(), "sessions");
  let best: { dir: string; id: string; cwd: string; mtime: number } | null = null;
  let cwdDirs: string[] = [];
  try {
    cwdDirs = await readdir(root);
  } catch {
    return null;
  }
  for (const cwdDir of cwdDirs) {
    let decoded = "";
    try {
      decoded = decodeURIComponent(cwdDir);
    } catch {
      continue;
    }
    if (!decoded.startsWith("/")) continue;
    const base = join(root, cwdDir);
    let ids: string[] = [];
    try {
      ids = await readdir(base);
    } catch {
      continue;
    }
    for (const id of ids) {
      if (!SESSION_ID_RE.test(id)) continue;
      const dir = join(base, id);
      try {
        const s = await stat(join(dir, "summary.json"));
        if (best === null || s.mtimeMs > best.mtime) {
          best = { dir, id, cwd: decoded, mtime: s.mtimeMs };
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

export function startGrok(emit: Emit): void {
  let watch: SessionWatch | null = null;
  let watchLive = false;

  const attach = async (dir: string, id: string, cwd: string, live: boolean): Promise<void> => {
    const fresh = new SessionWatch(dir, id, cwd);
    await fresh.refreshMeta();

    // Replay the whole event log (and the recent updates window) to rebuild
    // counters; surface only a short, time-ordered tail in the feed.
    const backfill: FeedItem[] = [];
    await fresh.events.poll((line) => fresh.foldEvent(line, backfill));
    await fresh.updates.poll((line) => fresh.foldUpdate(line, backfill));
    await fresh.hunks.poll((line) => fresh.foldHunk(line));
    backfill.sort((a, b) => a.at - b.at);
    const recent = backfill.slice(-30);

    watch = fresh;
    watchLive = live;
    emit.feed([
      { at: Date.now(), kind: "phase", text: `▶ attached ${id.slice(0, 8)} · ${cwd.split("/").pop() ?? cwd}` },
      ...recent,
    ]);
    emit.agent(fresh.snapshot(live));
  };

  // Discovery loop: prefer a live session (freshest events file wins).
  const discover = async (): Promise<void> => {
    const active = (await readActiveSessions()).filter((a) => pidAlive(a.pid));
    let target: { dir: string; id: string; cwd: string; live: boolean } | null = null;

    let bestMtime = -1;
    for (const a of active) {
      const dir = await findSessionDir(a.cwd, a.sessionId);
      if (dir === null) continue;
      let mtime = 0;
      try {
        mtime = (await stat(join(dir, "events.jsonl"))).mtimeMs;
      } catch {
        mtime = 0;
      }
      if (mtime > bestMtime) {
        bestMtime = mtime;
        target = { dir, id: a.sessionId, cwd: a.cwd, live: true };
      }
    }
    if (target === null) {
      const recent = await findRecentSession();
      if (recent !== null) target = { ...recent, live: false };
    }

    if (target === null) {
      if (watch !== null) {
        watch = null;
        emit.agent(null);
      }
      return;
    }
    if (watch === null || watch.id !== target.id) {
      await attach(target.dir, target.id, target.cwd, target.live);
    } else {
      watchLive = target.live;
    }
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

  // Tail + snapshot loop.
  let tailing = false;
  setInterval(() => {
    const w = watch;
    if (w === null || tailing) return;
    tailing = true;
    void (async () => {
      const fresh: FeedItem[] = [];
      await w.updates.poll((line) => w.foldUpdate(line, fresh));
      await w.events.poll((line) => w.foldEvent(line, fresh));
      await w.hunks.poll((line) => w.foldHunk(line));
      if (watch !== w) return; // session switched mid-poll; drop stale output
      if (w.events.truncated || w.updates.truncated || w.hunks.truncated) {
        // A source file shrank (rewind/rotation): counters folded from it
        // are stale, so rebuild the watch from scratch instead of folding
        // the replay into already-populated state.
        await attach(w.dir, w.id, w.cwd, watchLive);
        return;
      }
      if (fresh.length > 0) {
        fresh.sort((a, b) => a.at - b.at);
        emit.feed(fresh);
      }
      emit.agent(w.snapshot(watchLive));
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
    const w = watch;
    if (w !== null) void w.refreshMeta().catch(() => {});
  }, 3000);
}

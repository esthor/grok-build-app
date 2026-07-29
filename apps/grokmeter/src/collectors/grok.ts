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
import type { AgentPhase, AgentSnapshot, FeedItem, ToolStats } from "../shared/protocol.ts";

type Emit = {
  agent: (agent: AgentSnapshot | null) => void;
  feed: (items: FeedItem[]) => void;
};

const grokHome = (): string => process.env["GROK_HOME"] ?? join(homedir(), ".grok");

// ── Byte-offset line tail with torn-line tolerance ───────────────────────

class Tail {
  private readonly path: string;
  private offset: number;
  private buf = "";

  constructor(path: string, startAtEnd: boolean) {
    this.path = path;
    this.offset = startAtEnd ? -1 : 0; // -1: resolve to EOF on first poll
  }

  async poll(onLine: (line: string) => void): Promise<void> {
    let size: number;
    try {
      size = (await stat(this.path)).size;
    } catch {
      return;
    }
    if (this.offset === -1) {
      // First contact: start 128 KB back so the deck has recent history.
      this.offset = Math.max(0, size - 128 * 1024);
      if (this.offset > 0) {
        // Skip the first (probably partial) line.
        const text = await Bun.file(this.path).slice(this.offset, size).text();
        const nl = text.indexOf("\n");
        this.offset += nl >= 0 ? nl + 1 : text.length;
      }
    }
    if (size < this.offset) {
      this.offset = 0; // truncated / rotated
      this.buf = "";
    }
    if (size === this.offset) return;
    const chunk = await Bun.file(this.path).slice(this.offset, size).text();
    this.offset = size;
    this.buf += chunk;
    let nl = this.buf.indexOf("\n");
    while (nl >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line !== "") onLine(line);
      nl = this.buf.indexOf("\n");
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
      const tokens = num(meta["totalTokens"], 0);
      if (tokens > this.totalTokens) this.totalTokens = tokens;
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
      updatedAt: Date.now(),
      phase: this.permPending ? "permission_prompt" : this.phase,
      turnCount: this.turnCount,
      userMessages: this.userMessages,
      assistantMessages: this.assistantMessages,
      toolCallCount,
      toolFailureCount: this.toolFailureCount,
      errorCount: this.errorCount,
      compactionCount: this.compactionCount,
      durationSec: Math.max(0, Math.floor((Date.now() - this.createdAt) / 1000)),
      contextUsedTokens: this.totalTokens,
      contextWindowTokens: this.contextWindowTokens,
      totalTokens: this.totalTokens,
      ttftAvgMs: ttftAvg,
      ttftMinMs: this.ttft.length > 0 ? Math.min(...this.ttft) : 0,
      ttftMaxMs: this.ttft.length > 0 ? Math.max(...this.ttft) : 0,
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
      if (sessionId === "" || cwd === "") continue;
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
async function findRecentSession(): Promise<{ dir: string; id: string; cwd: string } | null> {
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
  return best === null ? null : { dir: best.dir, id: best.id, cwd: best.cwd };
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
  void discover();
  setInterval(() => void discover(), 2000);

  // Tail + snapshot loop.
  setInterval(() => {
    const w = watch;
    if (w === null) return;
    void (async () => {
      const fresh: FeedItem[] = [];
      await w.updates.poll((line) => w.foldUpdate(line, fresh));
      await w.events.poll((line) => w.foldEvent(line, fresh));
      await w.hunks.poll((line) => w.foldHunk(line));
      if (fresh.length > 0) {
        fresh.sort((a, b) => a.at - b.at);
        emit.feed(fresh);
      }
      emit.agent(w.snapshot(watchLive));
    })();
  }, 900);

  // Meta refresh (summary/signals are small atomic files).
  setInterval(() => {
    const w = watch;
    if (w !== null) void w.refreshMeta();
  }, 3000);
}

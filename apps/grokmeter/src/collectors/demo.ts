// Demo generators: a scripted grok session and wandering system stats.
// Emits the exact same protocol as the live collectors so the deck cannot
// tell the difference. The fictional mission: grokmeter building itself.

import type {
  AgentPhase,
  AgentSnapshot,
  CollectorEmit,
  FeedItem,
  FleetEntry,
  SysStats,
  ToolStats,
} from "../shared/protocol.ts";

export type DemoHandle = {
  setFocus: (id: string) => void;
};

const TOOLS = [
  "read_file",
  "grep",
  "list_dir",
  "run_terminal_command",
  "write",
  "search_replace",
  "web_search",
] as const;

const FILES = [
  "src/web/widgets/radar.ts",
  "src/web/widgets/context-ring.ts",
  "src/web/fx/backdrop.ts",
  "src/collectors/grok.ts",
  "src/shared/protocol.ts",
  "src/web/style.css",
  "src/server.ts",
];

const COMMANDS = [
  "bun run check",
  "bun test",
  "git status --short",
  "ls -la ~/.grok/sessions",
  "jq -r .type events.jsonl | sort | uniq -c",
  "rg 'phase_changed' --count",
];

const THOUGHTS = [
  "The radar sweep should decay old pings, not clear them...",
  "Context ring needs tick marks every 10% — more instrument, less donut.",
  "Tail from byte offset, re-stat on rename. Lock files are noise.",
  "Segmented bars read better than smooth fills at a glance.",
  "The feed is the heartbeat. Everything else is instrumentation.",
  "Snap to an 8px grid; loose pixels feel wrong in a HUD.",
  "Amber for warnings only. Cyan carries the theme.",
  "permission_prompt deserves a klaxon color. Subtle, but present.",
];

const MESSAGES = [
  "Wired the tool radar to live per-tool aggregates.",
  "Context gauge now reads from signals.json — 500k window detected.",
  "Backdrop grid parallax is in. Sixty frames, no jank.",
  "Diff tape scrolls the last twelve hunks with author glyphs.",
  "Latency block shows TTFT min/avg/max plus ITL p99.",
];

const TRACKS: ReadonlyArray<readonly [artist: string, track: string, album: string, sec: number]> = [
  ["NIGHT DRIVE 2077", "Neon Rain", "Chrome Horizon", 254],
  ["Sector 7", "Ion Trail", "Reentry", 312],
  ["polygon ghost", "phosphor dreams", "CRT", 198],
  ["Umbra Vector", "Signal / Noise", "Afterimage", 276],
];

function pick<T>(arr: readonly T[], rnd: () => number): T {
  const i = Math.floor(rnd() * arr.length);
  const v = arr[i];
  if (v === undefined) throw new Error("pick from empty array");
  return v;
}

/** Deterministic-ish PRNG so demo runs feel alive but reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startDemo(emit: CollectorEmit): DemoHandle {
  const rnd = mulberry32(0x67726f6b); // "grok"
  const startedAt = Date.now();

  // ── Agent session state ────────────────────────────────────────────────
  const tools: Record<string, ToolStats> = {};
  let phase: AgentPhase = "waiting_for_model";
  let turnCount = 1;
  let userMessages = 1;
  let assistantMessages = 0;
  let toolCallCount = 0;
  let toolFailureCount = 0;
  let contextUsed = 31_400;
  let totalTokens = 31_400;
  let linesAdded = 0;
  let linesRemoved = 0;
  const touched = new Set<string>();
  let permsRequested = 0;
  let permsDenied = 0;
  let permPending = false;
  let compactionCount = 0;
  let activeTool: string | null = null;
  let toolStartedAt = 0;

  const snapshot = (): AgentSnapshot => ({
    id: "demo-019f-cafe-f00d",
    title: "Build the Grokmeter Deck",
    cwd: "~/dev/grok-build-app",
    model: "grok-4.5",
    agentName: "grok-build",
    reasoningEffort: "high",
    sandbox: "workspace-write",
    live: true,
    startedAt,
    updatedAt: Date.now(),
    phase,
    turnCount,
    userMessages,
    assistantMessages,
    toolCallCount,
    toolFailureCount,
    errorCount: 0,
    compactionCount,
    durationSec: Math.floor((Date.now() - startedAt) / 1000),
    contextUsedTokens: Math.floor(contextUsed),
    contextWindowTokens: 500_000,
    totalTokens: Math.floor(totalTokens),
    ttftAvgMs: 2354,
    ttftMinMs: 1008,
    ttftMaxMs: 5367,
    itlP50Ms: 14,
    itlP99Ms: 112,
    linesAdded,
    linesRemoved,
    filesTouched: touched.size,
    gitBranch: "feat/rainmeter-deck",
    gitCommit: "5da6962",
    tools,
    permsRequested,
    permsDenied,
    permAvgWaitMs: 1240,
    permPending,
  });

  const feed = (items: FeedItem[]): void => {
    emit.feed(items);
  };

  const bumpTool = (name: string, ms: number, ok: boolean): void => {
    const cur = tools[name] ?? { count: 0, failures: 0, totalMs: 0 };
    cur.count += 1;
    cur.totalMs += ms;
    if (!ok) cur.failures += 1;
    tools[name] = cur;
  };

  // Scripted phase machine. Each step schedules the next with plausible timing.
  const enter = (next: AgentPhase, after: number): void => {
    setTimeout(() => {
      phase = next;
      const now = Date.now();

      if (next === "waiting_for_model") {
        feed([{ at: now, kind: "phase", text: "dispatching request" }]);
        enter("streaming_reasoning", 800 + rnd() * 2200);
        return;
      }

      if (next === "streaming_reasoning") {
        feed([{ at: now, kind: "thought", text: pick(THOUGHTS, rnd) }]);
        contextUsed += 300 + rnd() * 900;
        totalTokens += 300 + rnd() * 900;
        enter(rnd() < 0.72 ? "tool_execution" : "streaming_text", 1600 + rnd() * 3400);
        return;
      }

      if (next === "tool_execution") {
        const tool = pick(TOOLS, rnd);
        activeTool = tool;
        toolStartedAt = now;
        toolCallCount += 1;
        const needsPerm = tool === "run_terminal_command" || tool === "write" || tool === "search_replace";
        const detail =
          tool === "run_terminal_command"
            ? pick(COMMANDS, rnd)
            : tool === "write" || tool === "search_replace"
              ? pick(FILES, rnd)
              : tool === "grep"
                ? `"${pick(["phase_changed", "totalTokens", "sessionUpdate", "tool_call"], rnd)}"`
                : tool === "web_search"
                  ? `"rainmeter ${pick(["skin ini format", "audiolevel measure", "illustro"], rnd)}"`
                  : pick(FILES, rnd);

        if (needsPerm && rnd() < 0.5) {
          permsRequested += 1;
          permPending = true;
          feed([{ at: now, kind: "perm_req", text: detail, tool }]);
          setTimeout(() => {
            permPending = false;
            const denied = rnd() < 0.08;
            if (denied) permsDenied += 1;
            feed([
              { at: Date.now(), kind: "perm_res", text: denied ? "denied" : "allowed", tool, ok: !denied },
            ]);
          }, 600 + rnd() * 2600);
        }

        feed([{ at: now, kind: "tool_start", text: detail, tool }]);

        const runMs = 250 + rnd() * 4200;
        setTimeout(() => {
          const ok = rnd() > 0.06;
          bumpTool(tool, runMs, ok);
          if (!ok) toolFailureCount += 1;
          feed([
            {
              at: Date.now(),
              kind: "tool_end",
              text: ok ? "ok" : "exit 1",
              tool,
              ok,
              ms: Math.floor(runMs),
            },
          ]);
          if ((tool === "write" || tool === "search_replace") && ok) {
            const file = pick(FILES, rnd);
            const add = Math.floor(rnd() * 42) + 2;
            const rem = Math.floor(rnd() * 14);
            linesAdded += add;
            linesRemoved += rem;
            touched.add(file);
            feed([{ at: Date.now(), kind: "edit", text: `${file} +${add} −${rem}` }]);
          }
          activeTool = null;
          contextUsed += 500 + rnd() * 2400;
          totalTokens += 500 + rnd() * 2400;
          enter(rnd() < 0.62 ? "tool_execution" : "streaming_text", 300 + rnd() * 1200);
        }, runMs);
        return;
      }

      if (next === "streaming_text") {
        assistantMessages += 1;
        feed([{ at: now, kind: "message", text: pick(MESSAGES, rnd) }]);
        contextUsed += 200 + rnd() * 700;
        totalTokens += 200 + rnd() * 700;
        if (rnd() < 0.3) {
          // End of turn → brief idle → user replies → next turn.
          enter("idle", 1200 + rnd() * 2000);
        } else {
          enter("streaming_reasoning", 900 + rnd() * 1600);
        }
        return;
      }

      // idle → next user turn
      feed([{ at: now, kind: "turn", text: `turn ${turnCount} complete` }]);
      setTimeout(() => {
        turnCount += 1;
        userMessages += 1;
        if (contextUsed > 420_000) {
          compactionCount += 1;
          contextUsed = 96_000;
          feed([{ at: Date.now(), kind: "phase", text: "context compacted" }]);
        }
        feed([
          {
            at: Date.now(),
            kind: "user",
            text: pick(
              [
                "make the radar sweep slower",
                "add a matrix theme",
                "the feed should glow on tool failures",
                "wire it to the live session",
                "tighten the corner brackets",
              ],
              rnd,
            ),
          },
        ]);
        enter("waiting_for_model", 400 + rnd() * 800);
      }, 2400 + rnd() * 4200);
    }, after);
  };

  feed([{ at: Date.now(), kind: "user", text: "build me a rainmeter deck for grok" }]);
  enter("waiting_for_model", 600);

  // Snapshot broadcast cadence.
  setInterval(() => {
    // Slow ambient context burn while streaming.
    if (phase === "streaming_reasoning" || phase === "streaming_text") {
      contextUsed += 40 + rnd() * 120;
      totalTokens += 40 + rnd() * 120;
    }
    if (activeTool !== null && Date.now() - toolStartedAt > 15_000) {
      // Safety valve; scripted timers should never leave a tool dangling.
      activeTool = null;
    }
    emit.agent(snapshot());
    emitFleet();
  }, 1000);

  // ── Demo fleet: the scripted mission plus two ambient sessions ────────
  let focusedId = "demo-019f-cafe-f00d";
  const emitFleet = (): void => {
    const main = snapshot();
    const rows: FleetEntry[] = [
      {
        id: main.id,
        title: main.title,
        cwd: main.cwd,
        model: main.model,
        phase: main.phase,
        live: true,
        focused: focusedId === main.id,
        permPending: main.permPending,
        contextUsedTokens: main.contextUsedTokens,
        contextWindowTokens: main.contextWindowTokens,
        toolCallCount: main.toolCallCount,
        updatedAt: Date.now(),
      },
      {
        id: "demo-019f-beef-0001",
        title: "Refactor Skin Runtime",
        cwd: "~/dev/grokamp",
        model: "grok-4.5",
        phase: "idle",
        live: true,
        focused: focusedId === "demo-019f-beef-0001",
        permPending: false,
        contextUsedTokens: 212_400,
        contextWindowTokens: 500_000,
        toolCallCount: 87,
        updatedAt: Date.now() - 340_000,
      },
      {
        id: "demo-019f-beef-0002",
        title: "Fix CI Flake",
        cwd: "~/dev/vibecheck",
        model: "grok-4.5",
        phase: "permission_prompt",
        live: true,
        focused: focusedId === "demo-019f-beef-0002",
        permPending: true,
        contextUsedTokens: 64_100,
        contextWindowTokens: 500_000,
        toolCallCount: 21,
        updatedAt: Date.now() - 12_000,
      },
    ];
    emit.fleet(rows);
  };

  // ── System stats ───────────────────────────────────────────────────────
  const CORES = 10;
  const corePhase = Array.from({ length: CORES }, () => rnd() * Math.PI * 2);
  let rxTotal = 4.2e9;
  let txTotal = 1.1e9;
  let memUsed = 21.4e9;

  setInterval(() => {
    const t = Date.now() / 1000;
    const cores = corePhase.map((p, i) => {
      const base = 18 + 14 * Math.sin(t / 7 + p) + 10 * Math.sin(t / 2.3 + p * 3);
      const spike = rnd() < 0.06 ? rnd() * 55 : 0;
      const v = Math.max(1, Math.min(98, base + spike + (i < 4 ? 12 : -4)));
      return Math.round(v * 10) / 10;
    });
    const totalPct = Math.round((cores.reduce((a, b) => a + b, 0) / CORES) * 10) / 10;

    memUsed += (rnd() - 0.48) * 3e8;
    memUsed = Math.max(14e9, Math.min(30e9, memUsed));

    const rxBps = Math.max(0, 3e5 + 2.8e5 * Math.sin(t / 5) + (rnd() < 0.1 ? rnd() * 9e6 : rnd() * 4e5));
    const txBps = Math.max(0, 8e4 + 6e4 * Math.sin(t / 7 + 2) + (rnd() < 0.06 ? rnd() * 2.5e6 : rnd() * 1e5));
    rxTotal += rxBps;
    txTotal += txBps;

    const sys: SysStats = {
      at: Date.now(),
      hostname: "deck-01.local",
      os: "macOS 26.5",
      uptimeSec: 86_400 * 3 + Math.floor((Date.now() - startedAt) / 1000) + 4_231,
      cpu: {
        totalPct,
        cores,
        load1: Math.round((2.1 + Math.sin(t / 11) * 1.2 + rnd() * 0.4) * 100) / 100,
        load5: 2.4,
        load15: 2.2,
      },
      mem: {
        usedBytes: Math.floor(memUsed),
        totalBytes: 36e9,
        wiredBytes: 3.1e9,
        compressedBytes: 1.9e9,
      },
      net: { iface: "en0", rxBps, txBps, rxTotal, txTotal },
      disk: { path: "/", usedBytes: 612e9, totalBytes: 994e9 },
      procs: [
        { pid: 79343, name: "grok", cpuPct: 12 + rnd() * 30, memPct: 1.2 },
        { pid: 512, name: "bun", cpuPct: 4 + rnd() * 12, memPct: 0.6 },
        { pid: 40112, name: "WindowServer", cpuPct: 6 + rnd() * 9, memPct: 2.1 },
        { pid: 887, name: "kernel_task", cpuPct: 3 + rnd() * 6, memPct: 0.4 },
        { pid: 63001, name: "Chromium Helper", cpuPct: 2 + rnd() * 18, memPct: 3.8 },
      ]
        .map((p) => ({ ...p, cpuPct: Math.round(p.cpuPct * 10) / 10 }))
        .sort((a, b) => b.cpuPct - a.cpuPct),
    };
    emit.sys(sys);
  }, 1000);

  // ── Media ──────────────────────────────────────────────────────────────
  let trackIdx = 0;
  let pos = 34;
  setInterval(() => {
    const entry = TRACKS[trackIdx % TRACKS.length];
    if (entry === undefined) return;
    const [artist, track, album, dur] = entry;
    pos += 1;
    if (pos >= dur) {
      trackIdx += 1;
      pos = 0;
    }
    emit.media({
      player: "Music",
      state: "playing",
      track,
      artist,
      album,
      positionSec: pos,
      durationSec: dur,
    });
  }, 1000);

  return {
    setFocus: (id: string): void => {
      if (id === focusedId) return;
      focusedId = id;
      // The scripted mission keeps streaming regardless; the marker keeps
      // the demo honest about what a focus switch does.
      feed([{ at: Date.now(), kind: "phase", text: `▶ focused ${id.slice(0, 13)} (demo)` }]);
      emitFleet();
    },
  };
}

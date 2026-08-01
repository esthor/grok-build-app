import { useStore } from "@tanstack/react-store";
import { useState, type ReactNode } from "react";
import {
  addRandomTask,
  advance,
  pauseToggle,
  play,
  stop,
} from "../agent/controller";
import { queueStore, toggleRepeat, toggleShuffle } from "../state/queue";
import { sessionStore } from "../state/session";
import {
  allSkins,
  setSkin,
  settingsStore,
  updateSettings,
} from "../state/settings";
import { openWindowIds, toggleWindow, windowsStore, type WinId } from "../state/windows";
import { Marquee } from "../ui/Marquee";
import { SevenSeg } from "../ui/SevenSeg";
import { Led, LcdText, Slider, SquareBtn } from "../ui/controls";
import { cycleVisMode, VisCanvas } from "../vis/VisCanvas";

function fmtClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(Math.min(99, m)).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const WIN_TOGGLES: readonly { id: WinId; label: string; title: string }[] = [
  { id: "tuner", label: "TUN", title: "harness tuner (the EQ)" },
  { id: "queue", label: "QUE", title: "task queue (the playlist)" },
  { id: "terminal", label: "TRM", title: "terminal scrollback" },
  { id: "vis", label: "VIS", title: "big visualizer" },
  { id: "todos", label: "TDO", title: "agent todo list" },
  { id: "mcp", label: "MCP", title: "mcp servers" },
  { id: "skinlab", label: "LAB", title: "skin lab" },
];

export function MainTile(): ReactNode {
  const session = useStore(sessionStore);
  const settings = useStore(settingsStore);
  const queue = useStore(queueStore);
  const openWins = useStore(windowsStore, (s) => openWindowIds(s).join(","));
  const [showRemain, setShowRemain] = useState(false);

  const llama = Date.now() < session.llamaUntil;
  const running = session.status === "running";
  const blocked = session.status === "blocked";
  const paused = session.status === "paused";

  const remainMs =
    session.tokPerSec > 1 && session.task !== null
      ? ((session.task.estOutputTokens - session.usage.outputTokens) / session.tokPerSec) * 1000
      : null;
  const clock =
    showRemain && remainMs !== null && (running || blocked)
      ? `-${fmtClock(remainMs)}`
      : ` ${fmtClock(session.elapsedMs)}`;

  const playGlyph = blocked ? "⚿" : running ? "▶" : paused ? "⏸" : session.status === "done" ? "✓" : "■";

  const marqueeText = llama
    ? "GROKAMP — IT REALLY WHIPS THE LLAMA'S ASS *** RESPECT TO 1997 *** NULLSOFT FOREVER"
    : session.task === null
      ? "GROKAMP 0.1 — queue a task and press play"
      : `${session.task.title} (${session.task.repo})${
          blocked
            ? " *** WAITING FOR APPROVAL"
            : paused
              ? " *** PAUSED"
              : session.status === "done"
                ? " *** DONE"
                : ""
        }${session.activeToolLabel !== null ? ` *** ${session.activeToolLabel}` : ""}`;

  const ctxPct = Math.min(
    100,
    Math.round((session.usage.contextUsed / session.usage.contextLimit) * 100),
  );
  const mcpUp = session.mcp.some((s) => s.status === "online");

  const riskLabel = settings.risk < -33 ? "SAFE" : settings.risk > 33 ? "YOLO" : "BAL";

  const cycleSkin = (): void => {
    // read the store, not the render snapshot: rapid clicks must not stale
    const skins = allSkins();
    const index = skins.findIndex((s) => s.name === settingsStore.state.skinName);
    const next = skins[(index + 1) % skins.length];
    if (next !== undefined) {
      setSkin(next.name);
    }
  };

  return (
    <div className="main-tile">
      <div className="clutterbar">
        <button type="button" title="options: cycle skin" onClick={cycleSkin}>
          O
        </button>
        <button
          type="button"
          title="always on top (desktop shell)"
          data-lit={settings.alwaysOnTop ? "yes" : "no"}
          onClick={() => {
            updateSettings({ alwaysOnTop: !settings.alwaysOnTop });
          }}
        >
          A
        </button>
        <button
          type="button"
          title="info / credits"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("grokamp:about"));
          }}
        >
          I
        </button>
        <button
          type="button"
          title="double size (ctrl+d)"
          data-lit={settings.doubleSize ? "yes" : "no"}
          onClick={() => {
            updateSettings({ doubleSize: !settings.doubleSize });
          }}
        >
          D
        </button>
        <button type="button" title="cycle visualizer" onClick={cycleVisMode}>
          V
        </button>
      </div>

      <div className="main-lcd lcd">
        <button
          type="button"
          className="main-time"
          title="click: elapsed / remaining (est)"
          data-blink={paused || blocked ? "yes" : "no"}
          onClick={() => {
            setShowRemain((v) => !v);
          }}
        >
          <span className="playstate" data-warn={blocked ? "yes" : "no"}>
            {playGlyph}
          </span>
          <SevenSeg text={clock} height={38} />
        </button>

        <div className="main-marquee">
          <Marquee text={marqueeText} />
        </div>

        <div className="main-readouts">
          <span className="readout" title="output tokens per second">
            <LcdText accent>{String(Math.round(session.tokPerSec)).padStart(3, "0")}</LcdText>
            <LcdText dim> TOK/S</LcdText>
          </span>
          <span className="readout" title="context window used">
            <LcdText accent>{String(ctxPct).padStart(2, "0")}</LcdText>
            <LcdText dim> %CTX</LcdText>
          </span>
          <span className="readout" title="session cost">
            <LcdText accent>${session.usage.costUsd.toFixed(2)}</LcdText>
          </span>
        </div>

        <div className="main-minivis">
          <VisCanvas width={150} height={32} />
        </div>

        <div className="main-status">
          <Led on={mcpUp} label="MCP" />
          <Led on={session.subagentActive} label="SUB" />
          <Led
            on={session.pendingPerms.length > 0}
            color="var(--sk-warn)"
            label="PERM"
          />
          <LcdText dim>GROK·CODE·256K</LcdText>
        </div>
      </div>

      <div className="main-midrow">
        <div className="main-slider-block" title="throttle — simulated tokens/sec">
          <span className="mini-label">THR</span>
          <Slider
            value={settings.throttle}
            min={0}
            max={100}
            title="throttle — simulated tokens/sec"
            onChange={(v) => {
              updateSettings({ throttle: v });
            }}
          />
        </div>
        <div
          className="main-slider-block main-slider-risk"
          title="risk appetite — paranoid ⟷ yolo (gates auto-approvals)"
        >
          <span className="mini-label" data-warn={riskLabel === "YOLO" ? "yes" : "no"}>
            {riskLabel}
          </span>
          <Slider
            value={settings.risk}
            min={-100}
            max={100}
            detent
            title="risk appetite — paranoid to yolo"
            onChange={(v) => {
              updateSettings({ risk: v });
            }}
          />
        </div>
        <div className="main-wintoggles">
          {WIN_TOGGLES.map((w) => (
            <SquareBtn
              key={w.id}
              title={w.title}
              lit={openWins.split(",").includes(w.id)}
              onClick={() => {
                toggleWindow(w.id);
              }}
            >
              {w.label}
            </SquareBtn>
          ))}
        </div>
      </div>

      <div className="main-posbar" title="est. progress through task">
        <div className="main-posbar-track slider-groove">
          <div
            className="main-posbar-thumb slider-thumb"
            style={{ left: `calc(${(session.progress * 100).toFixed(1)}% - 14px)` }}
          />
        </div>
      </div>

      <div className="main-transport">
        <SquareBtn wide title="previous task (z)" onClick={() => { advance(-1, false); }}>
          ⏮
        </SquareBtn>
        <SquareBtn wide title="play (x)" onClick={play} lit={running}>
          ▶
        </SquareBtn>
        <SquareBtn wide title="pause (c)" onClick={pauseToggle} lit={paused}>
          ⏸
        </SquareBtn>
        <SquareBtn wide title="stop (v)" onClick={stop}>
          ■
        </SquareBtn>
        <SquareBtn wide title="next task (b)" onClick={() => { advance(1, false); }}>
          ⏭
        </SquareBtn>
        <span className="transport-gap" />
        <SquareBtn wide title="eject: queue a new task (l)" onClick={addRandomTask}>
          ⏏
        </SquareBtn>
        <span className="transport-gap" />
        <SquareBtn
          title="shuffle queue (s)"
          lit={queue.shuffle}
          onClick={toggleShuffle}
        >
          SHUF
        </SquareBtn>
        <SquareBtn title="repeat queue (r)" lit={queue.repeat} onClick={toggleRepeat}>
          REP
        </SquareBtn>
      </div>
    </div>
  );
}

import { useStore } from "@tanstack/react-store";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  addRandomTask,
  advance,
  pauseToggle,
  play,
  readAnalyserFrame,
  stop,
} from "../agent/controller";
import { BAND_COUNT, SCOPE_LENGTH } from "../agent/analyser";
import { queueStore, toggleRepeat, toggleShuffle } from "../state/queue";
import { sessionStore } from "../state/session";
import { currentSkin, settingsStore } from "../state/settings";
import {
  focusWindow,
  openWindowIds,
  setWindowOpen,
  toggleWindow,
  windowsStore,
} from "../state/windows";
import { wszStore } from "../skins/wsz";
import { beginDrag, dragStore, updateDrag } from "../wm/drag";
import { cycleVisMode } from "../vis/VisCanvas";
import type { TileProps } from "./registry";

/**
 * The HEAD UNIT: a real 275x116 classic-skin main window rendered at 2x
 * from a user-supplied .wsz. Every rectangle below is classic-format
 * anatomy (documented in docs/WINAMP.md); every pixel comes from the
 * user's own skin file.
 */
const W = 275;
const H = 116;
const SCALE = 2;

interface HitRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const HITS: readonly HitRect[] = [
  { id: "close", x: 264, y: 3, w: 9, h: 9 },
  { id: "prev", x: 16, y: 88, w: 23, h: 18 },
  { id: "play", x: 39, y: 88, w: 23, h: 18 },
  { id: "pause", x: 62, y: 88, w: 23, h: 18 },
  { id: "stop", x: 85, y: 88, w: 23, h: 18 },
  { id: "next", x: 108, y: 88, w: 22, h: 18 },
  { id: "eject", x: 136, y: 89, w: 22, h: 16 },
  { id: "shuffle", x: 164, y: 89, w: 47, h: 15 },
  { id: "repeat", x: 210, y: 89, w: 28, h: 15 },
  { id: "eq", x: 219, y: 58, w: 23, h: 12 },
  { id: "pl", x: 242, y: 58, w: 23, h: 12 },
  { id: "vis", x: 24, y: 43, w: 76, h: 16 },
];

const ACTIONS: Readonly<Record<string, () => void>> = {
  close: () => {
    setWindowOpen("head", false);
  },
  prev: () => {
    advance(-1, false);
  },
  play,
  pause: pauseToggle,
  stop,
  next: () => {
    advance(1, false);
  },
  eject: addRandomTask,
  shuffle: toggleShuffle,
  repeat: toggleRepeat,
  eq: () => {
    toggleWindow("tuner");
  },
  pl: () => {
    toggleWindow("queue");
  },
  vis: cycleVisMode,
};

/** text.bmp: 3 rows x 31 cols of 5x6 glyphs (single-case font) */
const FONT_ROW0 = "abcdefghijklmnopqrstuvwxyz\"@";
const FONT_ROW1 = "0123456789….:()-'!_+\\/[]^&%,=$#";

function glyphPos(char: string): readonly [number, number] {
  const c = char.toLowerCase();
  const i0 = FONT_ROW0.indexOf(c);
  if (i0 >= 0) {
    return [0, i0];
  }
  const i1 = FONT_ROW1.indexOf(c);
  if (i1 >= 0) {
    return [1, i1];
  }
  if (c === "?") {
    return [2, 3];
  }
  if (c === "*") {
    return [2, 4];
  }
  return [0, 30]; // space
}

function inRect(x: number, y: number, r: HitRect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

export function HeadTile({ rect, frame }: TileProps): ReactNode {
  const focused = useStore(windowsStore, (s) => s.focus === "head");
  const shaded = useStore(windowsStore, (s) => s.shaded["head"] === true);
  const wsz = useStore(wszStore);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pressedRef = useRef<string | null>(null);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (canvas === null || ctx === null) {
      return;
    }
    const bands = new Float32Array(BAND_COUNT);
    const scope = new Float32Array(SCOPE_LENGTH);
    const peaks = new Float32Array(BAND_COUNT);
    let raf = 0;
    let tickerStep = 0;
    let lastTick = 0;

    const drawText = (text: string, dx: number, dy: number, maxChars: number): void => {
      const sheet = wsz?.sheets.text;
      if (sheet === undefined) {
        return;
      }
      for (let i = 0; i < Math.min(text.length, maxChars); i++) {
        const [row, col] = glyphPos(text[i] ?? " ");
        ctx.drawImage(sheet, col * 5, row * 6, 5, 6, dx + i * 5, dy, 5, 6);
      }
    };

    const drawDigits = (text: string, xs: readonly number[], dy: number): void => {
      const sheet = wsz?.sheets.numbers;
      if (sheet === undefined) {
        return;
      }
      for (let i = 0; i < xs.length; i++) {
        const ch = text[i];
        const x = xs[i];
        if (ch === undefined || x === undefined || ch < "0" || ch > "9") {
          continue;
        }
        ctx.drawImage(sheet, Number(ch) * 9, 0, 9, 13, x, dy, 9, 13);
      }
    };

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const session = sessionStore.state;
      const settings = settingsStore.state;
      const queue = queueStore.state;
      const sheets = wsz?.sheets;

      if (sheets?.main === undefined) {
        ctx.fillStyle = "#101014";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#8a8f9a";
        ctx.font = "10px monospace";
        ctx.fillText("no skin worn — SKIN LAB → WEAR .WSZ", 24, 60);
        return;
      }

      ctx.drawImage(sheets.main, 0, 0);
      if (sheets.titlebar !== undefined) {
        ctx.drawImage(sheets.titlebar, 27, focusedRef.current ? 0 : 15, W, 14, 0, 0, W, 14);
        ctx.drawImage(sheets.titlebar, 304, 0, 8, 43, 10, 22, 8, 43);
      }

      // play/pause/stop indicator
      if (sheets.playpaus !== undefined) {
        const status = session.status;
        const sx = status === "running" || status === "blocked" ? 0 : status === "paused" ? 9 : 18;
        ctx.drawImage(sheets.playpaus, sx, 0, 9, 9, 26, 28, 9, 9);
      }

      // session clock mm:ss (blinks while paused, classic style)
      const paused = session.status === "paused";
      if (!paused || Math.floor(now / 600) % 2 === 0) {
        const totalSec = Math.max(0, Math.floor(session.elapsedMs / 1000));
        const mm = String(Math.min(99, Math.floor(totalSec / 60))).padStart(2, "0");
        const ss = String(totalSec % 60).padStart(2, "0");
        drawDigits(mm + ss, [48, 60, 78, 90], 26);
      }

      // ticker: one 5px character step every 220ms, `text + "  ***  "` loop
      const llama = Date.now() < session.llamaUntil;
      const base = llama
        ? "grokamp - it really whips the llama's ass"
        : session.task === null
          ? "grokamp - wear a classic skin, run an agent"
          : `${session.task.title} (${session.task.repo})${
              session.status === "blocked" ? " - waiting for approval" : ""
            }`;
      const looped = `${base}  ***  `;
      if (now - lastTick >= 220) {
        tickerStep = (tickerStep + 1) % looped.length;
        lastTick = now;
      }
      const visible =
        looped.length <= 31
          ? looped
          : (looped + looped).slice(tickerStep, tickerStep + 31);
      drawText(visible, 111, 24, 31);

      // kbps slot = tok/s, khz slot = ctx%
      drawText(String(Math.min(999, Math.round(session.tokPerSec))).padStart(3, " "), 111, 43, 3);
      drawText(
        String(
          Math.min(99, Math.round((session.usage.contextUsed / session.usage.contextLimit) * 100)),
        ).padStart(2, " "),
        156,
        43,
        2,
      );

      // mono/stereo lamps -> SUB / MCP
      if (sheets.monoster !== undefined) {
        const mcpUp = session.mcp.some((s) => s.status === "online");
        ctx.drawImage(sheets.monoster, 29, session.subagentActive ? 0 : 12, 27, 12, 212, 41, 27, 12);
        ctx.drawImage(sheets.monoster, 0, mcpUp ? 0 : 12, 29, 12, 239, 41, 29, 12);
      }

      // the 76x16 vis, painted with the skin's own viscolor ramp
      if (settings.visMode !== "off") {
        const palette = wsz?.viscolor ?? currentSkin().vis;
        readAnalyserFrame(bands, scope);
        ctx.fillStyle = palette[0] ?? "#000000";
        ctx.fillRect(24, 43, 76, 16);
        if (settings.visMode === "scope") {
          ctx.fillStyle = palette[18] ?? "#00ff00";
          for (let i = 0; i < 75; i++) {
            const sample = scope[Math.floor((i / 75) * SCOPE_LENGTH)] ?? 0;
            const y = 43 + 8 - Math.round(sample * 7);
            ctx.fillRect(24 + i, Math.max(43, Math.min(57, y)), 1, 1);
          }
        } else {
          for (let i = 0; i < BAND_COUNT; i++) {
            const level = bands[i] ?? 0;
            const peak = Math.max(level, (peaks[i] ?? 0) - 0.014);
            peaks[i] = peak;
            const barH = Math.round(level * 15);
            const x = 24 + i * 4;
            for (let row = 0; row < barH; row++) {
              const rampIndex = 2 + Math.min(15, Math.round(((barH - row) / 16) * 15));
              ctx.fillStyle = palette[rampIndex] ?? "#00ff00";
              ctx.fillRect(x, 58 - row, 3, 1);
            }
            if (peak > 0.03) {
              ctx.fillStyle = palette[23] ?? "#cccccc";
              ctx.fillRect(x, 58 - Math.round(peak * 15), 3, 1);
            }
          }
        }
      }

      // volume <- throttle (28 frames), balance <- risk
      if (sheets.volume !== undefined) {
        const frameIdx = Math.round((settings.throttle / 100) * 27);
        ctx.drawImage(sheets.volume, 0, frameIdx * 15, 68, 13, 107, 57, 68, 13);
        const thumbX = 107 + Math.round((settings.throttle / 100) * (68 - 14));
        ctx.drawImage(sheets.volume, 15, 422, 14, 11, thumbX, 58, 14, 11);
      }
      if (sheets.balance !== undefined) {
        const frameIdx = Math.round((Math.abs(settings.risk) / 100) * 27);
        ctx.drawImage(sheets.balance, 9, frameIdx * 15, 38, 13, 177, 57, 38, 13);
        const thumbX = 177 + Math.round(((settings.risk + 100) / 200) * (38 - 14));
        ctx.drawImage(sheets.balance, 15, 422, 14, 11, thumbX, 58, 14, 11);
      }

      // posbar <- task progress
      if (sheets.posbar !== undefined) {
        ctx.drawImage(sheets.posbar, 0, 0, 248, 10, 16, 72, 248, 10);
        if (session.status !== "idle" && session.status !== "done") {
          const thumbX = 16 + Math.round(session.progress * (248 - 29));
          ctx.drawImage(sheets.posbar, 248, 0, 29, 10, thumbX, 72, 29, 10);
        }
      }

      // transport + eject
      if (sheets.cbuttons !== undefined) {
        const buttons: readonly (readonly [string, number, number, number])[] = [
          ["prev", 0, 16, 23],
          ["play", 23, 39, 23],
          ["pause", 46, 62, 23],
          ["stop", 69, 85, 23],
          ["next", 92, 108, 22],
        ];
        for (const [id, sx, dx, bw] of buttons) {
          const pressed = pressedRef.current === id;
          ctx.drawImage(sheets.cbuttons, sx, pressed ? 18 : 0, bw, 18, dx, 88, bw, 18);
        }
        const ejectPressed = pressedRef.current === "eject";
        ctx.drawImage(sheets.cbuttons, 114, ejectPressed ? 16 : 0, 22, 16, 136, 89, 22, 16);
      }

      // shuffle / repeat with lit + pressed states
      if (sheets.shufrep !== undefined) {
        const shufY = (queue.shuffle ? 30 : 0) + (pressedRef.current === "shuffle" ? 15 : 0);
        ctx.drawImage(sheets.shufrep, 28, shufY, 47, 15, 164, 89, 47, 15);
        const repY = (queue.repeat ? 30 : 0) + (pressedRef.current === "repeat" ? 15 : 0);
        ctx.drawImage(sheets.shufrep, 0, repY, 28, 15, 210, 89, 28, 15);
        const open = new Set(openWindowIds(windowsStore.state));
        ctx.drawImage(sheets.shufrep, 0, open.has("tuner") ? 73 : 61, 23, 12, 219, 58, 23, 12);
        ctx.drawImage(sheets.shufrep, 23, open.has("queue") ? 73 : 61, 23, 12, 242, 58, 23, 12);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [wsz]);

  const toLocal = (e: ReactPointerEvent<HTMLCanvasElement>): readonly [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / SCALE, (e.clientY - rect.top) / SCALE];
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) {
      return;
    }
    focusWindow("head");
    const [x, y] = toLocal(e);
    const hit = HITS.find((r) => inRect(x, y, r));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit !== undefined) {
      pressedRef.current = hit.id;
      return;
    }
    // the skin's own titlebar is the drag handle; the tiler decides where it lands
    if (y < 14) {
      beginDrag("head");
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (dragStore.state.id !== "head") {
      return;
    }
    const host = document.getElementById("desktop");
    if (host === null) {
      return;
    }
    const box = host.getBoundingClientRect();
    updateDrag(e.clientX - box.left, e.clientY - box.top, frame);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const pressed = pressedRef.current;
    pressedRef.current = null;
    if (pressed === null) {
      return;
    }
    const [x, y] = toLocal(e);
    const hit = HITS.find((r) => inRect(x, y, r));
    if (hit !== undefined && hit.id === pressed) {
      ACTIONS[pressed]?.();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="head-win"
      data-focused={focused ? "yes" : "no"}
      width={W * SCALE}
      height={shaded ? 28 : H * SCALE}
      style={{
        // centered in the cell the tiler gave us, never scaled
        left: rect.x + Math.max(0, Math.round((rect.w - W * SCALE) / 2)),
        top: rect.y + Math.max(0, Math.round((rect.h - (shaded ? 28 : H * SCALE)) / 2)),
      }}
      title={wsz === null ? "head unit — wear a .wsz from the skin lab" : `head unit — ${wsz.name}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

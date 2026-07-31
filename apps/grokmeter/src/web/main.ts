// grokmeter deck runtime: mounts widgets ("meters"), lays them out in
// draggable panels, keeps the WebSocket link to the collectors ("measures"),
// and runs the shared animation tick.

import { decodeWire } from "../shared/protocol.ts";
import { Store } from "./store.ts";
import { Backdrop } from "./fx/backdrop.ts";
import { el } from "./lib.ts";
import type { WidgetDef, WidgetHandle } from "./widget.ts";

import { clockWidget } from "./widgets/clock.ts";
import { cpuWidget } from "./widgets/cpu.ts";
import { memWidget } from "./widgets/mem.ts";
import { netWidget } from "./widgets/net.ts";
import { diskWidget } from "./widgets/disk.ts";
import { procsWidget } from "./widgets/procs.ts";
import { agentStatusWidget } from "./widgets/agent-status.ts";
import { feedWidget } from "./widgets/feed.ts";
import { diffTapeWidget } from "./widgets/diff-tape.ts";
import { mediaWidget } from "./widgets/media.ts";
import { contextRingWidget } from "./widgets/context-ring.ts";
import { toolRadarWidget } from "./widgets/tool-radar.ts";
import { tokenFlowWidget } from "./widgets/token-flow.ts";
import { latencyWidget } from "./widgets/latency.ts";
import { missionWidget } from "./widgets/mission.ts";
import { permissionsWidget } from "./widgets/permissions.ts";
import { sysinfoWidget } from "./widgets/sysinfo.ts";

const WIDGETS: WidgetDef[] = [
  clockWidget,
  cpuWidget,
  memWidget,
  netWidget,
  diskWidget,
  procsWidget,
  agentStatusWidget,
  feedWidget,
  diffTapeWidget,
  mediaWidget,
  contextRingWidget,
  toolRadarWidget,
  tokenFlowWidget,
  latencyWidget,
  missionWidget,
  permissionsWidget,
  sysinfoWidget,
];

type Rect = { x: number; y: number; w: number; h: number };

const COLS = [300, 420, 320, 320] as const;
const GAP = 16;
const TOP = 52;
const SNAP = 8;
const LAYOUT_KEY = "grokmeter.layout.v1";
const THEME_KEY = "grokmeter.theme";
const THEMES = ["ghost", "mono", "cyan", "ember", "matrix"] as const;
const DEFAULT_THEME = "ghost";
const THEME_LABEL: Record<string, string> = {
  ghost: "MONO://GHOST",
  mono: "MONO://CHROME",
  cyan: "HUD://CYAN",
  ember: "GRID://EMBER",
  matrix: "NET://MATRIX",
};

function defaultLayout(vw: number): Map<string, Rect> {
  // Fit as many design columns as the viewport allows, left to right.
  const xs: number[] = [];
  let x = GAP;
  for (const w of COLS) {
    if (x + w + GAP <= vw || xs.length === 0) {
      xs.push(x);
      x += w + GAP;
    }
  }
  const active = xs.length;
  const stackY: number[] = new Array<number>(active).fill(TOP);
  const rects = new Map<string, Rect>();

  const sorted = [...WIDGETS].sort((a, b) => a.col - b.col || a.order - b.order);
  for (const def of sorted) {
    let target = def.col < active ? def.col : -1;
    if (target === -1) {
      // Fold into the currently shortest column.
      target = stackY.indexOf(Math.min(...stackY));
    }
    const colX = xs[target] ?? GAP;
    const colW = COLS[target as 0 | 1 | 2 | 3];
    const y = stackY[target] ?? TOP;
    rects.set(def.id, { x: colX, y, w: colW, h: def.h });
    stackY[target] = y + def.h + GAP;
  }
  return rects;
}

function isRect(v: unknown): v is Rect {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (k) => typeof o[k] === "number" && Number.isFinite(o[k]),
  );
}

function loadSavedLayout(): Record<string, Rect> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    // Trust nothing from storage: a stale schema or hand-edited entry with
    // non-numeric fields would otherwise flow into applyRect as
    // "undefinedpx" and silently misplace the widget.
    const out: Record<string, Rect> = {};
    for (const [id, rect] of Object.entries(parsed)) {
      if (isRect(rect)) out[id] = rect;
    }
    return out;
  } catch {
    return {};
  }
}

function main(): void {
  const store = new Store();
  const desktop = document.getElementById("desktop");
  const backdropCanvas = document.getElementById("backdrop");
  const trayMode = document.getElementById("tray-mode");
  const trayWs = document.getElementById("tray-ws");
  const trayTheme = document.getElementById("tray-theme");
  const trayEdit = document.getElementById("tray-edit");
  if (
    desktop === null ||
    !(backdropCanvas instanceof HTMLCanvasElement) ||
    trayMode === null ||
    trayWs === null ||
    !(trayTheme instanceof HTMLButtonElement) ||
    !(trayEdit instanceof HTMLButtonElement)
  ) {
    throw new Error("deck shell missing");
  }

  // ── Theme ──────────────────────────────────────────────────────────────
  const backdrop = new Backdrop(backdropCanvas);
  const setTheme = (name: string): void => {
    document.documentElement.setAttribute("data-theme", name);
    localStorage.setItem(THEME_KEY, name);
    trayTheme.textContent = THEME_LABEL[name] ?? name.toUpperCase();
    backdrop.retheme();
  };
  const storedTheme = localStorage.getItem(THEME_KEY);
  setTheme(THEMES.find((t) => t === storedTheme) ?? DEFAULT_THEME);
  const cycleTheme = (): void => {
    const cur = document.documentElement.getAttribute("data-theme") ?? DEFAULT_THEME;
    const idx = THEMES.indexOf(cur as (typeof THEMES)[number]);
    const next = THEMES[(idx + 1) % THEMES.length] ?? DEFAULT_THEME;
    setTheme(next);
  };
  trayTheme.addEventListener("click", cycleTheme);

  // ── Edit / ambient mode ────────────────────────────────────────────────
  let editing = false;
  const setEditing = (on: boolean): void => {
    editing = on;
    document.documentElement.classList.toggle("edit", on);
    trayEdit.textContent = on ? "EDITING" : "LOCKED";
    trayEdit.classList.toggle("active", on);
  };
  trayEdit.addEventListener("click", () => setEditing(!editing));

  // ── Layout ─────────────────────────────────────────────────────────────
  const saved = loadSavedLayout();
  const defaults = defaultLayout(window.innerWidth);
  const rects = new Map<string, Rect>();
  for (const def of WIDGETS) {
    const rect = saved[def.id] ?? defaults.get(def.id) ?? { x: GAP, y: TOP, w: 300, h: def.h };
    rects.set(def.id, rect);
  }
  const persist = (): void => {
    const out: Record<string, Rect> = {};
    for (const [id, r] of rects) out[id] = r;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(out));
  };
  const resetLayout = (): void => {
    localStorage.removeItem(LAYOUT_KEY);
    const fresh = defaultLayout(window.innerWidth);
    for (const def of WIDGETS) {
      const r = fresh.get(def.id);
      if (r === undefined) continue;
      rects.set(def.id, r);
      const node = document.querySelector<HTMLElement>(`.widget[data-id="${def.id}"]`);
      if (node !== null) applyRect(node, r);
    }
  };

  // Reflow with the viewport as long as the user hasn't placed things by
  // hand. Polling covers embedded webviews that skip resize events.
  let lastVw = window.innerWidth;
  const maybeReflow = (): void => {
    if (window.innerWidth === lastVw) return;
    lastVw = window.innerWidth;
    if (localStorage.getItem(LAYOUT_KEY) === null) resetLayout();
  };
  window.addEventListener("resize", maybeReflow);
  setInterval(maybeReflow, 800);

  function applyRect(node: HTMLElement, r: Rect): void {
    node.style.left = `${r.x}px`;
    node.style.top = `${r.y}px`;
    node.style.width = `${r.w}px`;
    node.style.height = `${r.h}px`;
  }

  // ── Mount widgets ──────────────────────────────────────────────────────
  const handles: WidgetHandle[] = [];
  for (const def of WIDGETS) {
    const root = el("section", "widget");
    root.dataset["id"] = def.id;
    const rect = rects.get(def.id);
    if (rect !== undefined) applyRect(root, rect);

    const corners = el("i", "corners");
    const head = el("header", "w-head");
    const label = el("span", "w-label", def.label);
    const status = el("span", "w-status");
    head.append(label, status);
    const body = el("div", "w-body");
    root.append(corners, head, body);
    desktop.append(root);

    const handle = def.mount({
      store,
      body,
      head,
      setStatus: (cls): void => {
        status.className = cls === "" ? "w-status" : `w-status ${cls}`;
      },
    });
    if (handle !== undefined) handles.push(handle);

    // Dragging (edit mode only).
    root.addEventListener("pointerdown", (ev) => {
      if (!editing) return;
      const r = rects.get(def.id);
      if (r === undefined) return;
      ev.preventDefault();
      try {
        root.setPointerCapture(ev.pointerId);
      } catch {
        // Synthetic pointers can't be captured; dragging still works.
      }
      const startX = ev.clientX - r.x;
      const startY = ev.clientY - r.y;
      const move = (mv: PointerEvent): void => {
        const nx = Math.round((mv.clientX - startX) / SNAP) * SNAP;
        const ny = Math.round((mv.clientY - startY) / SNAP) * SNAP;
        const maxX = Math.max(0, window.innerWidth - r.w);
        const maxY = Math.max(TOP - 16, window.innerHeight - r.h);
        const next: Rect = {
          x: Math.min(Math.max(0, nx), maxX),
          y: Math.min(Math.max(TOP - 16, ny), maxY),
          w: r.w,
          h: r.h,
        };
        rects.set(def.id, next);
        applyRect(root, next);
      };
      const up = (): void => {
        root.removeEventListener("pointermove", move);
        root.removeEventListener("pointerup", up);
        root.removeEventListener("pointercancel", up);
        persist();
      };
      root.addEventListener("pointermove", move);
      root.addEventListener("pointerup", up);
      // OS gestures / palm rejection cancel instead of completing; without
      // this, stale move listeners stack up and later drags jitter.
      root.addEventListener("pointercancel", up);
    });
  }

  // ── Keyboard ───────────────────────────────────────────────────────────
  window.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "e" || ev.key === "E") setEditing(!editing);
    if (ev.key === "t" || ev.key === "T") cycleTheme();
    if (ev.key === "r" || ev.key === "R") resetLayout();
  });

  // ── Tray link/mode readouts ────────────────────────────────────────────
  store.on("hello", (info) => {
    trayMode.innerHTML = "";
    trayMode.append("MODE:");
    trayMode.append(el("b", "", info.mode.toUpperCase()));
  });
  store.on("link", (up) => {
    trayWs.className = `tray-item ${up ? "on" : "off"}`;
    trayWs.innerHTML = "";
    trayWs.append("LINK:");
    trayWs.append(el("b", "", up ? "ONLINE" : "OFFLINE"));
  });

  // ── WebSocket link ─────────────────────────────────────────────────────
  let retryMs = 1000;
  const connect = (): void => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${proto}://${location.host}/ws`);
    sock.addEventListener("open", () => {
      retryMs = 1000;
      store.setLink(true);
    });
    sock.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      const msg = decodeWire(ev.data);
      if (msg !== null) store.ingest(msg);
    });
    sock.addEventListener("close", () => {
      store.setLink(false);
      setTimeout(connect, retryMs);
      retryMs = Math.min(10_000, retryMs * 1.5);
    });
    sock.addEventListener("error", () => {
      sock.close();
    });
  };
  connect();

  // ── Shared animation tick ──────────────────────────────────────────────
  const loop = (now: number): void => {
    backdrop.tick(now);
    for (const h of handles) h.tick?.(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();

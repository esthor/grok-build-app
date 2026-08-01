// Small DOM / formatting / drawing helpers shared by widgets.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls !== undefined && cls !== "") node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Computed-style reads are expensive and cssVar is called from per-frame
// tick loops; values only change on theme switch, so cache until invalidated.
const cssVarCache = new Map<string, string>();

export function cssVar(name: string): string {
  const hit = cssVarCache.get(name);
  if (hit !== undefined) return hit;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  cssVarCache.set(name, value);
  return value;
}

/** Call on theme change so cached values re-resolve. */
export function invalidateCssVars(): void {
  cssVarCache.clear();
}

/** Polar point on a circle; angles in degrees, 0° = 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** SVG arc path from a0° to a1° (Roundline-style partial ring). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const sweep = clamp(a1 - a0, 0, 359.999);
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a0 + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u += 1;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[u] ?? "B"}`;
}

export function fmtBps(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  return `${fmtBytes(n)}/s`;
}

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  const trim = (s: string): string => s.replace(/\.0+$/, "");
  if (n >= 1e6) return `${trim((n / 1e6).toFixed(2))}M`;
  if (n >= 1e3) return `${trim((n / 1e3).toFixed(1))}k`;
  return `${Math.round(n)}`;
}

/** Compact display names for grok tools (shared by feed + radar). */
export const TOOL_ABBREV: Record<string, string> = {
  read_file: "READ",
  grep: "GREP",
  glob: "GLOB",
  list_dir: "LS",
  run_terminal_command: "TERM",
  run_terminal_cmd: "TERM",
  write: "WRIT",
  search_replace: "EDIT",
  edit_notebook: "NB",
  delete_file: "DEL",
  web_search: "WEB",
  web_fetch: "FETCH",
  task: "AGENT",
  spawn_subagent: "AGENT",
  todo_write: "TODO",
  ask_user_question: "ASK",
  skill: "SKILL",
  lsp: "LSP",
  monitor: "MON",
  apply_patch: "PATCH",
};

export function toolAbbrev(name: string): string {
  const hit = TOOL_ABBREV[name];
  if (hit !== undefined) return hit;
  const mcp = name.split("__");
  const tail = mcp.length > 1 ? mcp[mcp.length - 1] : name;
  return (tail ?? name).slice(0, 5).toUpperCase();
}

export function fmtDur(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return "—";
  const s = Math.max(0, Math.floor(totalSec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function fmtClock(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return "—";
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = m.toString().padStart(2, "0");
  const sss = ss.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${sss}` : `${m}:${sss}`;
}

export function fmtTime(at: number): string {
  const d = new Date(at);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((x) => x.toString().padStart(2, "0"))
    .join(":");
}

/**
 * Prepare a canvas for drawing this frame: size the backing buffer for the
 * devicePixelRatio and return a transform-set 2d context, or null when the
 * canvas has no layout size yet. One implementation so canvas widgets can't
 * drift on the zero-size guard.
 */
export function frameCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return null;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** Fixed-capacity numeric ring for sparklines. */
export class Ring {
  readonly cap: number;
  private buf: number[];
  private idx = 0;
  private filled = 0;

  constructor(cap: number) {
    this.cap = cap;
    this.buf = new Array<number>(cap).fill(0);
  }

  push(v: number): void {
    this.buf[this.idx] = v;
    this.idx = (this.idx + 1) % this.cap;
    if (this.filled < this.cap) this.filled += 1;
  }

  reset(): void {
    this.buf.fill(0);
    this.idx = 0;
    this.filled = 0;
  }

  values(): number[] {
    const out: number[] = [];
    const start = (this.idx - this.filled + this.cap) % this.cap;
    for (let i = 0; i < this.filled; i += 1) {
      out.push(this.buf[(start + i) % this.cap] ?? 0);
    }
    return out;
  }

  get size(): number {
    return this.filled;
  }
}

/** DPI-aware canvas sparkline with glow stroke + alpha area fill. */
export class Spark {
  readonly canvas: HTMLCanvasElement;
  private readonly ring: Ring;

  constructor(cap = 120) {
    this.canvas = document.createElement("canvas");
    this.ring = new Ring(cap);
  }

  push(v: number): void {
    this.ring.push(v);
  }

  /** Wipe the canvas and history — call when the data source goes absent so
   * a dead session's trace doesn't linger. */
  clear(): void {
    this.ring.reset();
    const c = this.canvas;
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    // draw() leaves a DPR scale on the context; clearing in backing-store
    // coordinates requires the identity transform.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
  }

  /** Draw with a CSS color; scales to max of the window (min floor avoids flatlines). */
  draw(color: string, opts?: { floor?: number; baseline?: boolean }): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w === 0 || h === 0) return;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const vals = this.ring.values();
    if (vals.length < 2) return;
    const floor = opts?.floor ?? 1;
    const max = Math.max(floor, ...vals);
    const stepX = w / (this.ring.cap - 1);
    const y = (v: number): number => h - 1.5 - (v / max) * (h - 4);
    const x0 = w - (vals.length - 1) * stepX;

    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = x0 + i * stepX;
      if (i === 0) ctx.moveTo(x, y(v));
      else ctx.lineTo(x, y(v));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Area fill at low alpha.
    const last = vals[vals.length - 1];
    if (last !== undefined) {
      ctx.lineTo(x0 + (vals.length - 1) * stepX, h);
      ctx.lineTo(x0, h);
      ctx.closePath();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (opts?.baseline === true) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(0, h - 1);
      ctx.lineTo(w, h - 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
}

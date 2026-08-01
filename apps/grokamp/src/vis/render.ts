import { BAND_COUNT, SCOPE_LENGTH } from "../agent/analyser";
import type { VisPalette } from "../skins/types";

/**
 * viscolor.txt slot map (see docs/SKINNING.md):
 * [0] bg, [1] grid dots, [2..17] spectrum ramp top->bottom,
 * [18..22] scope shades, [23] peak caps.
 */
function slot(palette: VisPalette, index: number, fallback: string): string {
  return palette[index] ?? fallback;
}

export interface VisFrameState {
  readonly bands: Float32Array;
  readonly scope: Float32Array;
  readonly peaks: Float32Array;
  plasmaT: number;
}

export function createVisState(): VisFrameState {
  return {
    bands: new Float32Array(BAND_COUNT),
    scope: new Float32Array(SCOPE_LENGTH),
    peaks: new Float32Array(BAND_COUNT),
    plasmaT: 0,
  };
}

export function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: VisPalette,
): void {
  ctx.fillStyle = slot(palette, 0, "#000000");
  ctx.fillRect(0, 0, w, h);
  // the classic dot grid
  ctx.fillStyle = slot(palette, 1, "#1a1a1a");
  for (let y = 2; y < h; y += 4) {
    for (let x = 2; x < w; x += 4) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: VisFrameState,
  palette: VisPalette,
): void {
  paintBackdrop(ctx, w, h, palette);
  const gap = 2;
  const barW = Math.max(3, Math.floor((w - gap * (BAND_COUNT + 1)) / BAND_COUNT));
  for (let i = 0; i < BAND_COUNT; i++) {
    const level = state.bands[i] ?? 0;
    const peakPrev = state.peaks[i] ?? 0;
    const peak = Math.max(level, peakPrev - 0.012); // caps fall slowly
    state.peaks[i] = peak;

    const x = gap + i * (barW + gap);
    const barH = Math.round(level * (h - 4));
    // stacked cells, hot color on top like 1997 intended
    const cell = 4;
    const cells = Math.floor(barH / cell);
    for (let c = 0; c < cells; c++) {
      const frac = 1 - c / Math.max(1, Math.floor((h - 4) / cell)); // 1 at top
      const rampIndex = 2 + Math.min(15, Math.floor(frac * 15));
      ctx.fillStyle = slot(palette, rampIndex, "#00ff00");
      ctx.fillRect(x, h - 2 - (c + 1) * cell + 1, barW, cell - 1);
    }
    if (peak > 0.02) {
      const peakY = h - 2 - Math.round(peak * (h - 4));
      ctx.fillStyle = slot(palette, 23, "#cccccc");
      ctx.fillRect(x, Math.max(1, peakY), barW, 2);
    }
  }
}

export function drawScope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: VisFrameState,
  palette: VisPalette,
): void {
  paintBackdrop(ctx, w, h, palette);
  ctx.strokeStyle = slot(palette, 18, "#00ff00");
  ctx.lineWidth = 2;
  ctx.beginPath();
  const mid = h / 2;
  for (let i = 0; i < SCOPE_LENGTH; i++) {
    const x = (i / (SCOPE_LENGTH - 1)) * w;
    const y = mid - (state.scope[i] ?? 0) * (h * 0.42);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  // dimmer echo, like the multi-shade winamp scope
  ctx.strokeStyle = slot(palette, 21, "#008f00");
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < SCOPE_LENGTH; i++) {
    const x = (i / (SCOPE_LENGTH - 1)) * w;
    const y = mid - (state.scope[i] ?? 0) * (h * 0.42) * 0.5;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

/** budget milkdrop: sine-plasma that breathes with harness energy */
export function drawPlasma(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: VisFrameState,
  palette: VisPalette,
): void {
  let energy = 0;
  for (let i = 0; i < BAND_COUNT; i++) {
    energy += state.bands[i] ?? 0;
  }
  energy /= BAND_COUNT;
  state.plasmaT += 0.02 + energy * 0.12;

  const cell = 6;
  const t = state.plasmaT;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const v =
        Math.sin(x * 0.02 + t) +
        Math.sin(y * 0.03 - t * 1.3) +
        Math.sin((x + y) * 0.015 + t * 0.7) +
        Math.sin(Math.hypot(x - w / 2, y - h / 2) * 0.03 - t * 1.8);
      const norm = (v + 4) / 8; // 0..1
      const rampIndex = 2 + Math.min(15, Math.floor((1 - norm) * 15 * (0.35 + energy * 1.4)));
      ctx.fillStyle = slot(palette, rampIndex, "#113311");
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

export function drawOff(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: VisPalette,
): void {
  paintBackdrop(ctx, w, h, palette);
}

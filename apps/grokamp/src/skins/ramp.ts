import type { VisPalette } from "./types";

function hexToRgb(hex: string): readonly [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number): string =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** interpolate `stops` into exactly `count` colors */
export function ramp(stops: readonly string[], count: number): string[] {
  const first = stops[0];
  if (first === undefined) {
    return [];
  }
  if (stops.length === 1 || count === 1) {
    return Array.from({ length: count }, () => first);
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const pos = (i / (count - 1)) * (stops.length - 1);
    const seg = Math.min(stops.length - 2, Math.floor(pos));
    const a = stops[seg] ?? first;
    const b = stops[seg + 1] ?? a;
    out.push(lerpHex(a, b, pos - seg));
  }
  return out;
}

interface VisBuild {
  readonly bg: string;
  readonly grid: string;
  /** spectrum stops, TOP first (classic winamp put the hot color on top) */
  readonly spectrum: readonly string[];
  readonly scope: readonly string[];
  readonly peak: string;
}

/** assemble a full 24-slot viscolor-style palette */
export function buildVis(spec: VisBuild): VisPalette {
  return [
    spec.bg,
    spec.grid,
    ...ramp(spec.spectrum, 16),
    ...ramp(spec.scope, 5),
    spec.peak,
  ];
}

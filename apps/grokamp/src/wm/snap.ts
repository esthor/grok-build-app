/**
 * Winamp-style magnetic windows. The original snapped at 10 screen px; we
 * render the classic pixel grid at 2x, so 20.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Size {
  readonly w: number;
  readonly h: number;
}

export const SNAP_DIST = 20;

interface AxisSpan {
  readonly lo: number;
  readonly hi: number;
}

function spansTouch(a: AxisSpan, b: AxisSpan, slack: number): boolean {
  return a.lo <= b.hi + slack && b.lo <= a.hi + slack;
}

function bestDelta(candidates: readonly number[], dist: number): number {
  let best = 0;
  let bestAbs = dist + 1;
  for (const c of candidates) {
    const abs = Math.abs(c);
    if (abs <= dist && abs < bestAbs) {
      best = c;
      bestAbs = abs;
    }
  }
  return best;
}

/**
 * Snap a proposed window position against sibling windows and the viewport.
 * Sibling edges attract both butt-joints (my right ↔ your left) and
 * alignments (my left ↔ your left) — but only when the windows overlap on
 * the perpendicular axis, so distant windows don't yank each other.
 */
export function snapPosition(
  proposed: Rect,
  others: readonly Rect[],
  viewport: Size,
  dist: number = SNAP_DIST,
): { x: number; y: number } {
  const xCandidates: number[] = [
    0 - proposed.x, // viewport left
    viewport.w - (proposed.x + proposed.w), // viewport right
  ];
  const yCandidates: number[] = [
    0 - proposed.y, // viewport top
    viewport.h - (proposed.y + proposed.h), // viewport bottom
  ];

  const mySpanY: AxisSpan = { lo: proposed.y, hi: proposed.y + proposed.h };
  const mySpanX: AxisSpan = { lo: proposed.x, hi: proposed.x + proposed.w };

  for (const other of others) {
    const otherSpanY: AxisSpan = { lo: other.y, hi: other.y + other.h };
    const otherSpanX: AxisSpan = { lo: other.x, hi: other.x + other.w };
    if (spansTouch(mySpanY, otherSpanY, dist)) {
      xCandidates.push(
        other.x - (proposed.x + proposed.w), // my right → your left
        other.x + other.w - proposed.x, // my left → your right
        other.x - proposed.x, // align lefts
        other.x + other.w - (proposed.x + proposed.w), // align rights
      );
    }
    if (spansTouch(mySpanX, otherSpanX, dist)) {
      yCandidates.push(
        other.y - (proposed.y + proposed.h), // my bottom → your top
        other.y + other.h - proposed.y, // my top → your bottom
        other.y - proposed.y, // align tops
        other.y + other.h - (proposed.y + proposed.h), // align bottoms
      );
    }
  }

  return {
    x: proposed.x + bestDelta(xCandidates, dist),
    y: proposed.y + bestDelta(yCandidates, dist),
  };
}

/** clamp so at least a titlebar-grab remains reachable */
export function clampToViewport(rect: Rect, viewport: Size): { x: number; y: number } {
  const minVisible = 48;
  const x = Math.min(Math.max(rect.x, minVisible - rect.w), viewport.w - minVisible);
  const y = Math.min(Math.max(rect.y, 0), viewport.h - 28);
  return { x, y };
}

/** quantize a proposed size to winamp-style segment steps */
export function quantizeSize(
  w: number,
  h: number,
  min: Size,
  step: Size,
): Size {
  const qw = Math.max(min.w, min.w + Math.round((w - min.w) / step.w) * step.w);
  const qh = Math.max(min.h, min.h + Math.round((h - min.h) / step.h) * step.h);
  return { w: qw, h: qh };
}

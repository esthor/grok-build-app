import { describe, expect, test } from "bun:test";
import { clampToViewport, quantizeSize, SNAP_DIST, snapPosition } from "./snap";

const VIEWPORT = { w: 1600, h: 900 };

describe("snapPosition", () => {
  test("threshold is winamp's 10px at the 2x render scale", () => {
    // docs/WINAMP.md: classic snap distance 10px; we render the classic
    // pixel grid at 2x, so the working threshold is 20
    expect(SNAP_DIST).toBe(20);
    // exactly at threshold: snaps
    const at = snapPosition({ x: 20, y: 300, w: 200, h: 100 }, [], VIEWPORT);
    expect(at.x).toBe(0);
    // one past threshold: stays put
    const past = snapPosition({ x: 21, y: 300, w: 200, h: 100 }, [], VIEWPORT);
    expect(past.x).toBe(21);
  });

  test("snaps to viewport left edge within threshold", () => {
    const pos = snapPosition({ x: 12, y: 300, w: 200, h: 100 }, [], VIEWPORT);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(300);
  });

  test("snaps to viewport bottom edge", () => {
    const pos = snapPosition({ x: 300, y: 785, w: 200, h: 100 }, [], VIEWPORT);
    expect(pos.y).toBe(800);
  });

  test("does not snap beyond threshold", () => {
    const pos = snapPosition({ x: 40, y: 40, w: 200, h: 100 }, [], VIEWPORT);
    expect(pos).toEqual({ x: 40, y: 40 });
  });

  test("butt-joins my left edge to a sibling's right edge", () => {
    const sibling = { x: 100, y: 100, w: 300, h: 200 };
    const pos = snapPosition({ x: 412, y: 150, w: 200, h: 100 }, [sibling], VIEWPORT);
    expect(pos.x).toBe(400);
  });

  test("aligns top edges when dragging alongside a sibling", () => {
    const sibling = { x: 100, y: 100, w: 300, h: 200 };
    const pos = snapPosition({ x: 410, y: 108, w: 200, h: 100 }, [sibling], VIEWPORT);
    expect(pos.y).toBe(100);
  });

  test("ignores siblings that do not overlap on the perpendicular axis", () => {
    const farSibling = { x: 100, y: 700, w: 300, h: 100 };
    const pos = snapPosition({ x: 412, y: 100, w: 200, h: 100 }, [farSibling], VIEWPORT);
    expect(pos.x).toBe(412);
  });

  test("prefers the closest candidate", () => {
    const a = { x: 0, y: 100, w: 395, h: 100 }; // right edge at 395
    const b = { x: 415, y: 100, w: 100, h: 100 }; // left edge at 415
    // moving window at x=402 w=10: my right edge (412) is 3px from b.left;
    // my left edge (402) is 7px from a.right → b wins, x becomes 405
    const pos = snapPosition({ x: 402, y: 100, w: 10, h: 100 }, [a, b], VIEWPORT);
    expect(pos.x).toBe(405);
  });
});

describe("clampToViewport", () => {
  test("keeps a grabbable sliver on screen", () => {
    const pos = clampToViewport({ x: -500, y: -50, w: 300, h: 200 }, VIEWPORT);
    expect(pos.x).toBe(48 - 300);
    expect(pos.y).toBe(0);
  });

  test("keeps windows from escaping bottom-right", () => {
    const pos = clampToViewport({ x: 2000, y: 2000, w: 300, h: 200 }, VIEWPORT);
    expect(pos.x).toBe(1600 - 48);
    expect(pos.y).toBe(900 - 28);
  });
});

describe("quantizeSize", () => {
  const min = { w: 450, h: 202 };
  const step = { w: 50, h: 58 };

  test("rounds to the nearest winamp segment", () => {
    expect(quantizeSize(480, 240, min, step)).toEqual({ w: 500, h: 260 });
  });

  test("never shrinks below the minimum", () => {
    expect(quantizeSize(100, 100, min, step)).toEqual(min);
  });

  test("keeps exact segment sizes stable", () => {
    expect(quantizeSize(550, 318, min, step)).toEqual({ w: 550, h: 318 });
  });
});

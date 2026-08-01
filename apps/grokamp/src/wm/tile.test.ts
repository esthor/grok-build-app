import { describe, expect, test } from "bun:test";
import {
  attachToRoot,
  GUTTER,
  insertAtLargest,
  insertBeside,
  layout,
  leaf,
  leafAt,
  leafIds,
  MIN_LEAF,
  moveLeaf,
  neighborOf,
  previewRect,
  removeLeaf,
  ROOT_MARGIN,
  rootEdge,
  setRatioAt,
  split,
  splitExtent,
  swapLeaves,
  zoneFor,
  type Rect,
  type TileNode,
} from "./tile";

const FRAME: Rect = { x: 0, y: 0, w: 1000, h: 600 };

function area(rect: Rect): number {
  return rect.w * rect.h;
}

describe("layout", () => {
  test("a single leaf fills the frame", () => {
    const { rects } = layout(leaf("a"), FRAME);
    expect(rects.get("a")).toEqual(FRAME);
  });

  test("children consume the full extent minus one gutter — no gaps, no overlap", () => {
    const { rects } = layout(split("row", leaf("a"), leaf("b"), 0.5), FRAME);
    const a = rects.get("a");
    const b = rects.get("b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (a === undefined || b === undefined) {
      return;
    }
    expect(a.w + b.w + GUTTER).toBe(FRAME.w);
    expect(a.x + a.w + GUTTER).toBe(b.x); // touching, not overlapping
    expect(a.h).toBe(FRAME.h);
  });

  test("no two leaves ever overlap, at any depth", () => {
    const tree = split(
      "row",
      split("col", leaf("a"), leaf("b"), 0.4),
      split("col", leaf("c"), split("row", leaf("d"), leaf("e")), 0.6),
      0.45,
    );
    const { rects } = layout(tree, FRAME);
    const entries = [...rects.values()];
    expect(entries).toHaveLength(5);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const p = entries[i];
        const q = entries[j];
        if (p === undefined || q === undefined) {
          continue;
        }
        const disjoint =
          p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
        expect(disjoint).toBe(true);
      }
    }
  });

  test("a rigid leaf keeps its intrinsic size and the sibling absorbs the rest", () => {
    const tree = split("row", leaf("head"), leaf("flex"), 0.5);
    const { rects } = layout(tree, FRAME, (id) =>
      id === "head" ? { w: 550, h: 232 } : {},
    );
    expect(rects.get("head")?.w).toBe(550);
    expect(rects.get("flex")?.w).toBe(FRAME.w - 550 - GUTTER);
  });

  test("shade rigidity applies per axis", () => {
    const tree = split("col", leaf("shaded"), leaf("body"), 0.5);
    const { rects } = layout(tree, FRAME, (id) => (id === "shaded" ? { h: 28 } : {}));
    expect(rects.get("shaded")?.h).toBe(28);
    expect(rects.get("shaded")?.w).toBe(FRAME.w); // still flexible across
    expect(rects.get("body")?.h).toBe(FRAME.h - 28 - GUTTER);
  });

  test("dividers sit in the gutter between siblings", () => {
    const { dividers } = layout(split("row", leaf("a"), leaf("b")), FRAME);
    expect(dividers).toHaveLength(1);
    expect(dividers[0]?.path).toBe("");
    expect(dividers[0]?.dir).toBe("row");
    expect(dividers[0]?.rect.w).toBe(GUTTER);
  });

  test("an empty tree yields nothing", () => {
    const { rects, dividers } = layout(null, FRAME);
    expect(rects.size).toBe(0);
    expect(dividers).toHaveLength(0);
  });
});

describe("splitExtent", () => {
  test("honors the minimum leaf size on both sides", () => {
    expect(splitExtent(1000, 0.001, null, null)).toBe(MIN_LEAF);
    expect(splitExtent(1000, 0.999, null, null)).toBe(1000 - GUTTER - MIN_LEAF);
  });

  test("rigid a wins over ratio", () => {
    expect(splitExtent(1000, 0.9, 300, null)).toBe(300);
  });

  test("rigid b leaves the remainder to a", () => {
    expect(splitExtent(1000, 0.1, null, 300)).toBe(1000 - GUTTER - 300);
  });

  test("degenerate frames don't produce negatives", () => {
    expect(splitExtent(2, 0.5, null, null)).toBe(0);
  });
});

describe("mutation", () => {
  const tree: TileNode<"a" | "b" | "c"> = split("row", leaf("a"), split("col", leaf("b"), leaf("c")));

  test("removing a leaf promotes its sibling", () => {
    const next = removeLeaf(tree, "b");
    expect(next).not.toBeNull();
    if (next === null) {
      return;
    }
    expect(leafIds(next).sort()).toEqual(["a", "c"]);
  });

  test("removing the last leaf empties the tree", () => {
    expect(removeLeaf(leaf("a"), "a")).toBeNull();
  });

  test("removing an absent leaf is a no-op", () => {
    expect(leafIds(removeLeaf(tree, "zz" as "a") ?? leaf("a")).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("insertBeside splits the target on the requested side", () => {
    const next = insertBeside(leaf("a"), "b", "a", "left");
    expect(next.kind).toBe("split");
    if (next.kind !== "split") {
      return;
    }
    expect(next.dir).toBe("row");
    expect(next.a).toEqual(leaf("b")); // "left" means before
  });

  test("swapLeaves exchanges positions without restructuring", () => {
    const next = swapLeaves(tree, "a", "c");
    const { rects: before } = layout(tree, FRAME);
    const { rects: after } = layout(next, FRAME);
    expect(after.get("c")).toEqual(before.get("a"));
    expect(after.get("a")).toEqual(before.get("c"));
  });

  test("moveLeaf with swap zone swaps; with a side it re-homes", () => {
    expect(leafIds(moveLeaf(tree, "a", "c", "swap")).sort()).toEqual(["a", "b", "c"]);
    const moved = moveLeaf(tree, "a", "b", "bottom");
    expect(leafIds(moved).sort()).toEqual(["a", "b", "c"]);
    const { rects } = layout(moved, FRAME);
    const a = rects.get("a");
    const b = rects.get("b");
    if (a === undefined || b === undefined) {
      return;
    }
    expect(a.y).toBeGreaterThan(b.y); // landed below b
  });

  test("dragging a window onto itself changes nothing", () => {
    expect(moveLeaf(tree, "a", "a", "left")).toBe(tree);
  });

  test("attachToRoot puts the window against a whole edge", () => {
    const next = attachToRoot(tree, "c", "left");
    expect(next.kind).toBe("split");
    if (next.kind !== "split") {
      return;
    }
    expect(next.a).toEqual(leaf("c"));
    expect(leafIds(next).sort()).toEqual(["a", "b", "c"]);
  });

  test("setRatioAt targets by path and clamps", () => {
    const next = setRatioAt(tree, "", 5);
    if (next.kind !== "split") {
      return;
    }
    expect(next.ratio).toBe(0.98);
    const nested = setRatioAt(tree, "b", 0.25);
    if (nested.kind !== "split" || nested.b.kind !== "split") {
      return;
    }
    expect(nested.b.ratio).toBe(0.25);
  });

  test("insertAtLargest splits the biggest leaf along its longer axis", () => {
    const start = split("row", leaf("small"), leaf("big"), 0.2);
    const { rects } = layout(start, FRAME);
    expect(area(rects.get("big") ?? FRAME)).toBeGreaterThan(area(rects.get("small") ?? FRAME));
    const next = insertAtLargest(start, "new", rects);
    const after = layout(next, FRAME).rects;
    expect(after.size).toBe(3);
    // the newcomer took space from "big", not from "small"
    expect(after.get("small")?.w).toBe(rects.get("small")?.w);
  });

  test("insertAtLargest seeds an empty workspace", () => {
    expect(insertAtLargest(null, "a", new Map())).toEqual(leaf("a"));
  });
});

describe("zoneFor", () => {
  const rect: Rect = { x: 100, y: 100, w: 400, h: 300 };

  test("middle swaps", () => {
    expect(zoneFor(rect, 300, 250)).toBe("swap");
  });

  test("each edge splits that way", () => {
    expect(zoneFor(rect, 105, 250)).toBe("left");
    expect(zoneFor(rect, 495, 250)).toBe("right");
    expect(zoneFor(rect, 300, 105)).toBe("top");
    expect(zoneFor(rect, 300, 395)).toBe("bottom");
  });

  test("corners resolve to the deeper edge, never ambiguously", () => {
    const zone = zoneFor(rect, 101, 103);
    expect(["left", "top"]).toContain(zone);
  });

  test("tiny windows still expose edge zones", () => {
    const tiny: Rect = { x: 0, y: 0, w: 60, h: 40 };
    expect(zoneFor(tiny, 1, 20)).toBe("left");
    expect(zoneFor(tiny, 30, 20)).not.toBe("swap"); // fully banded, no dead center
  });
});

describe("previewRect", () => {
  const rect: Rect = { x: 0, y: 0, w: 400, h: 200 };

  test("side zones preview a half, swap previews the whole", () => {
    expect(previewRect(rect, "left").w).toBe((400 - GUTTER) / 2);
    expect(previewRect(rect, "right").x).toBe(400 - (400 - GUTTER) / 2);
    expect(previewRect(rect, "bottom").y).toBe(200 - (200 - GUTTER) / 2);
    expect(previewRect(rect, "swap")).toEqual(rect);
  });
});

describe("hit testing", () => {
  const rects = new Map<"a" | "b", Rect>([
    ["a", { x: 0, y: 0, w: 100, h: 100 }],
    ["b", { x: 100, y: 0, w: 100, h: 100 }],
  ]);

  test("leafAt finds the pane under a point, or null outside", () => {
    expect(leafAt(rects, 50, 50)).toBe("a");
    expect(leafAt(rects, 150, 50)).toBe("b");
    expect(leafAt(rects, 500, 500)).toBeNull();
  });

  test("rootEdge reports the outer margin only", () => {
    expect(rootEdge(FRAME, 5, 300)).toBe("left");
    expect(rootEdge(FRAME, 995, 300)).toBe("right");
    expect(rootEdge(FRAME, 500, 3)).toBe("top");
    expect(rootEdge(FRAME, 500, 597)).toBe("bottom");
    expect(rootEdge(FRAME, 500, 300)).toBeNull();
  });

  test("the root margin stays thin so border panes keep their own edge zones", () => {
    // a pane flush with the top must still be splittable just inside the edge
    expect(ROOT_MARGIN).toBeLessThanOrEqual(12);
    expect(rootEdge(FRAME, 500, ROOT_MARGIN)).toBeNull();
    const flush: Rect = { x: 0, y: 0, w: 400, h: 300 };
    expect(zoneFor(flush, 200, ROOT_MARGIN + 1)).toBe("top");
  });

  test("neighborOf walks the visual grid", () => {
    expect(neighborOf(rects, "a", "right")).toBe("b");
    expect(neighborOf(rects, "b", "left")).toBe("a");
    expect(neighborOf(rects, "a", "top")).toBeNull();
  });
});

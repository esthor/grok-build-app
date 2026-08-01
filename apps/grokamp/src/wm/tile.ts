/**
 * Binary space-partition tiling — the geometry engine.
 *
 * Every pixel of the workspace belongs to exactly one leaf, so overlapping
 * windows are unrepresentable rather than merely discouraged, and gaps are
 * impossible (a split's children always consume its full extent). See
 * docs/WINDOWING.md for the prior art and the interaction decisions.
 *
 * Splits are addressed by path string ("" = root, "a", "ab", …) so the tree
 * stays plain serializable data with no identity bookkeeping.
 */

export type Dir = "row" | "col";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type TileNode<Id extends string> =
  | { readonly kind: "leaf"; readonly id: Id }
  | {
      readonly kind: "split";
      readonly dir: Dir;
      /** fraction of the main axis given to `a` (0..1) */
      readonly ratio: number;
      readonly a: TileNode<Id>;
      readonly b: TileNode<Id>;
    };

/** intrinsic size of a leaf, per axis; undefined = flexible */
export interface Intrinsic {
  readonly w?: number;
  readonly h?: number;
}

export type IntrinsicOf<Id extends string> = (id: Id) => Intrinsic;

export const MIN_LEAF = 120;
export const GUTTER = 4;

export interface Divider {
  readonly path: string;
  readonly dir: Dir;
  /** the gutter itself, for hit-testing and painting */
  readonly rect: Rect;
  /** the split's full rect, so a drag can map pointer → ratio directly */
  readonly parent: Rect;
}

export interface Layout<Id extends string> {
  readonly rects: ReadonlyMap<Id, Rect>;
  readonly dividers: readonly Divider[];
}

export function leaf<Id extends string>(id: Id): TileNode<Id> {
  return { kind: "leaf", id };
}

export function split<Id extends string>(
  dir: Dir,
  a: TileNode<Id>,
  b: TileNode<Id>,
  ratio = 0.5,
): TileNode<Id> {
  return { kind: "split", dir, ratio, a, b };
}

export function leafIds<Id extends string>(node: TileNode<Id>): Id[] {
  return node.kind === "leaf" ? [node.id] : [...leafIds(node.a), ...leafIds(node.b)];
}

export function hasLeaf<Id extends string>(node: TileNode<Id>, id: Id): boolean {
  return node.kind === "leaf" ? node.id === id : hasLeaf(node.a, id) || hasLeaf(node.b, id);
}

/**
 * Rigid extent of a subtree along one axis, or null when flexible. Only
 * leaves are intrinsically rigid; a split is rigid along its own direction
 * when both children are, and along its cross axis when either child is
 * (the pane can't be narrower than the art it contains).
 */
function rigidExtent<Id extends string>(
  node: TileNode<Id>,
  dir: Dir,
  intrinsic: IntrinsicOf<Id>,
): number | null {
  if (node.kind === "leaf") {
    const size = intrinsic(node.id);
    return (dir === "row" ? size.w : size.h) ?? null;
  }
  const a = rigidExtent(node.a, dir, intrinsic);
  const b = rigidExtent(node.b, dir, intrinsic);
  if (node.dir === dir) {
    return a !== null && b !== null ? a + b + GUTTER : null;
  }
  if (a === null && b === null) {
    return null;
  }
  return Math.max(a ?? 0, b ?? 0);
}

/** split `main` px between two children, honoring rigid sizes and minimums */
export function splitExtent(
  main: number,
  ratio: number,
  aRigid: number | null,
  bRigid: number | null,
  min = MIN_LEAF,
): number {
  const usable = main - GUTTER;
  if (usable <= 0) {
    return 0;
  }
  const lo = Math.min(min, usable);
  const hi = Math.max(lo, usable - min);
  const clamp = (value: number): number => Math.max(lo, Math.min(hi, Math.round(value)));
  // rigid sizes bypass MIN_LEAF (a shaded window really is titlebar-tall);
  // they only yield when honoring them would starve the flexible sibling
  const rigidClamp = (value: number): number =>
    Math.max(0, Math.min(Math.round(value), Math.max(0, usable - min)));
  if (aRigid !== null) {
    return rigidClamp(aRigid);
  }
  if (bRigid !== null) {
    return Math.max(0, usable - rigidClamp(bRigid));
  }
  return clamp(usable * ratio);
}

export function layout<Id extends string>(
  tree: TileNode<Id> | null,
  frame: Rect,
  intrinsic: IntrinsicOf<Id> = () => ({}),
): Layout<Id> {
  const rects = new Map<Id, Rect>();
  const dividers: Divider[] = [];

  const walk = (node: TileNode<Id>, rect: Rect, path: string): void => {
    if (node.kind === "leaf") {
      rects.set(node.id, rect);
      return;
    }
    const isRow = node.dir === "row";
    const main = isRow ? rect.w : rect.h;
    const aSize = splitExtent(
      main,
      node.ratio,
      rigidExtent(node.a, node.dir, intrinsic),
      rigidExtent(node.b, node.dir, intrinsic),
    );
    const bSize = Math.max(0, main - aSize - GUTTER);
    const aRect: Rect = isRow
      ? { x: rect.x, y: rect.y, w: aSize, h: rect.h }
      : { x: rect.x, y: rect.y, w: rect.w, h: aSize };
    const bRect: Rect = isRow
      ? { x: rect.x + aSize + GUTTER, y: rect.y, w: bSize, h: rect.h }
      : { x: rect.x, y: rect.y + aSize + GUTTER, w: rect.w, h: bSize };
    dividers.push({
      path,
      dir: node.dir,
      rect: isRow
        ? { x: rect.x + aSize, y: rect.y, w: GUTTER, h: rect.h }
        : { x: rect.x, y: rect.y + aSize, w: rect.w, h: GUTTER },
      parent: rect,
    });
    walk(node.a, aRect, `${path}a`);
    walk(node.b, bRect, `${path}b`);
  };

  if (tree !== null) {
    walk(tree, frame, "");
  }
  return { rects, dividers };
}

// ------------------------------------------------------------ mutation

export function setRatioAt<Id extends string>(
  tree: TileNode<Id>,
  path: string,
  ratio: number,
): TileNode<Id> {
  if (path.length === 0) {
    if (tree.kind !== "split") {
      return tree;
    }
    return { ...tree, ratio: Math.max(0.02, Math.min(0.98, ratio)) };
  }
  if (tree.kind !== "split") {
    return tree;
  }
  const head = path[0];
  const rest = path.slice(1);
  return head === "a"
    ? { ...tree, a: setRatioAt(tree.a, rest, ratio) }
    : { ...tree, b: setRatioAt(tree.b, rest, ratio) };
}

/** drop a leaf; its sibling inherits the space. null = tree is now empty */
export function removeLeaf<Id extends string>(
  tree: TileNode<Id>,
  id: Id,
): TileNode<Id> | null {
  if (tree.kind === "leaf") {
    return tree.id === id ? null : tree;
  }
  if (tree.a.kind === "leaf" && tree.a.id === id) {
    return tree.b;
  }
  if (tree.b.kind === "leaf" && tree.b.id === id) {
    return tree.a;
  }
  const a = removeLeaf(tree.a, id);
  const b = removeLeaf(tree.b, id);
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return { ...tree, a, b };
}

export type DropZone = "left" | "right" | "top" | "bottom" | "swap";

/** insert `id` beside `targetId` on the given side */
export function insertBeside<Id extends string>(
  tree: TileNode<Id>,
  id: Id,
  targetId: Id,
  side: Exclude<DropZone, "swap">,
): TileNode<Id> {
  const dir: Dir = side === "left" || side === "right" ? "row" : "col";
  const before = side === "left" || side === "top";
  const replace = (node: TileNode<Id>): TileNode<Id> => {
    if (node.kind === "leaf") {
      if (node.id !== targetId) {
        return node;
      }
      return before ? split(dir, leaf(id), node) : split(dir, node, leaf(id));
    }
    return { ...node, a: replace(node.a), b: replace(node.b) };
  };
  return replace(tree);
}

export function swapLeaves<Id extends string>(
  tree: TileNode<Id>,
  first: Id,
  second: Id,
): TileNode<Id> {
  const swap = (node: TileNode<Id>): TileNode<Id> => {
    if (node.kind === "leaf") {
      if (node.id === first) {
        return leaf(second);
      }
      if (node.id === second) {
        return leaf(first);
      }
      return node;
    }
    return { ...node, a: swap(node.a), b: swap(node.b) };
  };
  return swap(tree);
}

/** the drag-and-drop commit: swap in place, or re-home beside a target */
export function moveLeaf<Id extends string>(
  tree: TileNode<Id>,
  dragId: Id,
  targetId: Id,
  zone: DropZone,
): TileNode<Id> {
  if (dragId === targetId) {
    return tree;
  }
  if (zone === "swap") {
    return swapLeaves(tree, dragId, targetId);
  }
  const without = removeLeaf(tree, dragId);
  if (without === null) {
    return tree;
  }
  return insertBeside(without, dragId, targetId, zone);
}

/** drag past the workspace edge: the window takes that whole side */
export function attachToRoot<Id extends string>(
  tree: TileNode<Id>,
  id: Id,
  side: Exclude<DropZone, "swap">,
): TileNode<Id> {
  const without = removeLeaf(tree, id) ?? leaf(id);
  if (!hasLeaf(without, id) && without.kind === "leaf" && without.id === id) {
    return without;
  }
  const dir: Dir = side === "left" || side === "right" ? "row" : "col";
  return side === "left" || side === "top"
    ? split(dir, leaf(id), without, 0.32)
    : split(dir, without, leaf(id), 0.68);
}

/** opening a window splits the largest leaf along its longer axis */
export function insertAtLargest<Id extends string>(
  tree: TileNode<Id> | null,
  id: Id,
  rects: ReadonlyMap<Id, Rect>,
): TileNode<Id> {
  if (tree === null) {
    return leaf(id);
  }
  let bestId: Id | null = null;
  let bestArea = -1;
  let bestRect: Rect | null = null;
  for (const leafId of leafIds(tree)) {
    const rect = rects.get(leafId);
    if (rect === undefined) {
      continue;
    }
    const area = rect.w * rect.h;
    if (area > bestArea) {
      bestArea = area;
      bestId = leafId;
      bestRect = rect;
    }
  }
  if (bestId === null || bestRect === null) {
    return split("row", tree, leaf(id));
  }
  const side = bestRect.w >= bestRect.h ? "right" : "bottom";
  return insertBeside(tree, id, bestId, side);
}

// ------------------------------------------------------------ hit testing

export const EDGE_FRACTION = 0.3;
export const EDGE_MIN = 28;
export const EDGE_MAX = 110;

function band(extent: number): number {
  return Math.max(EDGE_MIN, Math.min(EDGE_MAX, extent * EDGE_FRACTION));
}

/**
 * Which zone a pointer sits in: outer 30% of each side (clamped 28–110px)
 * splits that way, the middle swaps. Whichever edge the pointer is deepest
 * into wins, so corners resolve predictably.
 */
export function zoneFor(rect: Rect, px: number, py: number): DropZone {
  const bx = band(rect.w);
  const by = band(rect.h);
  const left = px - rect.x;
  const right = rect.x + rect.w - px;
  const top = py - rect.y;
  const bottom = rect.y + rect.h - py;
  const candidates: readonly (readonly [DropZone, number])[] = [
    ["left", bx - left],
    ["right", bx - right],
    ["top", by - top],
    ["bottom", by - bottom],
  ];
  let winner: DropZone = "swap";
  let bestDepth = 0;
  for (const [zone, depth] of candidates) {
    if (depth > bestDepth) {
      bestDepth = depth;
      winner = zone;
    }
  }
  return winner;
}

/** the rect a drop would produce — the ghost the user sees before releasing */
export function previewRect(rect: Rect, zone: DropZone): Rect {
  const halfW = Math.round((rect.w - GUTTER) / 2);
  const halfH = Math.round((rect.h - GUTTER) / 2);
  switch (zone) {
    case "left":
      return { ...rect, w: halfW };
    case "right":
      return { x: rect.x + rect.w - halfW, y: rect.y, w: halfW, h: rect.h };
    case "top":
      return { ...rect, h: halfH };
    case "bottom":
      return { x: rect.x, y: rect.y + rect.h - halfH, w: rect.w, h: halfH };
    case "swap":
      return rect;
  }
}

export function leafAt<Id extends string>(
  rects: ReadonlyMap<Id, Rect>,
  x: number,
  y: number,
): Id | null {
  for (const [id, rect] of rects) {
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
      return id;
    }
  }
  return null;
}

/**
 * Which root edge (if any) the pointer is in the outer margin of.
 *
 * Deliberately thin: panes are flush with the workspace boundary, so a fat
 * margin would shadow the top/left edge zones of every border pane and you
 * could never split them. 12px means a root dock needs a deliberate push to
 * the very edge (the Windows Snap gesture), while the pane-local zone —
 * which reaches 28–110px inward — stays the easy default. The ghost label
 * ("DOCK TOP" vs "SPLIT TOP") plus a full-width ghost make which one you're
 * getting unmistakable before release.
 */
export const ROOT_MARGIN = 12;

export function rootEdge(
  frame: Rect,
  x: number,
  y: number,
  margin = ROOT_MARGIN,
): Exclude<DropZone, "swap"> | null {
  if (x - frame.x < margin) {
    return "left";
  }
  if (frame.x + frame.w - x < margin) {
    return "right";
  }
  if (y - frame.y < margin) {
    return "top";
  }
  if (frame.y + frame.h - y < margin) {
    return "bottom";
  }
  return null;
}

/** neighbor in a direction, for Alt+Shift+arrow moves */
export function neighborOf<Id extends string>(
  rects: ReadonlyMap<Id, Rect>,
  id: Id,
  side: Exclude<DropZone, "swap">,
): Id | null {
  const from = rects.get(id);
  if (from === undefined) {
    return null;
  }
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  let best: Id | null = null;
  let bestDist = Infinity;
  for (const [otherId, rect] of rects) {
    if (otherId === id) {
      continue;
    }
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dx = cx - fromCx;
    const dy = cy - fromCy;
    const aligned =
      side === "left"
        ? dx < 0 && Math.abs(dy) < Math.max(from.h, rect.h)
        : side === "right"
          ? dx > 0 && Math.abs(dy) < Math.max(from.h, rect.h)
          : side === "top"
            ? dy < 0 && Math.abs(dx) < Math.max(from.w, rect.w)
            : dy > 0 && Math.abs(dx) < Math.max(from.w, rect.w);
    if (!aligned) {
      continue;
    }
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = otherId;
    }
  }
  return best;
}

import { Store } from "@tanstack/store";
import {
  attachToRoot,
  insertAtLargest,
  layout,
  leaf,
  leafIds,
  moveLeaf,
  neighborOf,
  removeLeaf,
  setRatioAt,
  split,
  swapLeaves,
  type DropZone,
  type Intrinsic,
  type Layout,
  type Rect,
  type TileNode,
} from "../wm/tile";
import { debounced, loadPersisted, savePersisted } from "./persist";

export type WinId =
  | "main"
  | "tuner"
  | "queue"
  | "terminal"
  | "vis"
  | "todos"
  | "mcp"
  | "skinlab"
  | "head"
  | "museum";

export const WIN_IDS: readonly WinId[] = [
  "main",
  "tuner",
  "queue",
  "terminal",
  "vis",
  "todos",
  "mcp",
  "skinlab",
  "head",
  "museum",
];

/** the head unit is a real 275x116 classic skin at 2x — never scaled */
export const HEAD_SIZE = { w: 550, h: 232 } as const;
export const SHADE_H = 28;

export interface WindowsState {
  /** the partition tree; null = empty workspace. Only open windows appear. */
  readonly tree: TileNode<WinId> | null;
  readonly shaded: Readonly<Partial<Record<WinId, boolean>>>;
  readonly focus: WinId | null;
}

const DEFAULT_TREE: TileNode<WinId> = split(
  "row",
  split("col", leaf("main"), split("col", leaf("tuner"), leaf("queue"), 0.42), 0.3),
  split("col", leaf("terminal"), leaf("vis"), 0.62),
  0.44,
);

const DEFAULT_WINDOWS: WindowsState = {
  tree: DEFAULT_TREE,
  shaded: {},
  focus: "main",
};

function isWinId(value: unknown): value is WinId {
  return typeof value === "string" && (WIN_IDS as readonly string[]).includes(value);
}

/** structural validation: unknown ids or duplicates would corrupt the layout */
function decodeTree(raw: unknown, seen: Set<WinId>): TileNode<WinId> | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const node = raw as Record<string, unknown>;
  if (node["kind"] === "leaf") {
    const id = node["id"];
    if (!isWinId(id) || seen.has(id)) {
      return null;
    }
    seen.add(id);
    return leaf(id);
  }
  if (node["kind"] !== "split") {
    return null;
  }
  const dir = node["dir"];
  if (dir !== "row" && dir !== "col") {
    return null;
  }
  const a = decodeTree(node["a"], seen);
  const b = decodeTree(node["b"], seen);
  if (a === null || b === null) {
    return a ?? b; // a half-valid split collapses to whichever child survived
  }
  const ratio = typeof node["ratio"] === "number" ? node["ratio"] : 0.5;
  return split(dir, a, b, ratio);
}

function decodeWindows(raw: unknown): WindowsState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const shaded: Partial<Record<WinId, boolean>> = {};
  const rawShaded = record["shaded"];
  if (typeof rawShaded === "object" && rawShaded !== null) {
    for (const [key, value] of Object.entries(rawShaded)) {
      if (isWinId(key) && typeof value === "boolean") {
        shaded[key] = value;
      }
    }
  }
  const focus = record["focus"];
  return {
    tree: decodeTree(record["tree"], new Set()),
    shaded,
    focus: isWinId(focus) ? focus : null,
  };
}

export const windowsStore = new Store<WindowsState>(
  loadPersisted("windows.v2", decodeWindows) ?? DEFAULT_WINDOWS,
);

const persistWindows = debounced(() => {
  savePersisted("windows.v2", windowsStore.state);
}, 300);

windowsStore.subscribe(persistWindows);

export function isOpen(state: WindowsState, id: WinId): boolean {
  return state.tree !== null && leafIds(state.tree).includes(id);
}

export function openWindowIds(state: WindowsState): readonly WinId[] {
  return state.tree === null ? [] : leafIds(state.tree);
}

/** per-axis intrinsic size: the head unit is fixed, shaded windows are short */
export function intrinsicFor(state: WindowsState): (id: WinId) => Intrinsic {
  return (id) => {
    if (id === "head") {
      return state.shaded[id] === true ? { w: HEAD_SIZE.w, h: SHADE_H } : HEAD_SIZE;
    }
    return state.shaded[id] === true ? { h: SHADE_H } : {};
  };
}

export function computeLayout(state: WindowsState, frame: Rect): Layout<WinId> {
  return layout(state.tree, frame, intrinsicFor(state));
}

const FALLBACK_FRAME: Rect = { x: 0, y: 0, w: 1440, h: 900 };

export function focusWindow(id: WinId): void {
  windowsStore.setState((s) => (s.focus === id ? s : { ...s, focus: id }));
}

export function setWindowOpen(id: WinId, open: boolean, frame?: Rect): void {
  windowsStore.setState((s) => {
    if (open === isOpen(s, id)) {
      return s;
    }
    if (!open) {
      return {
        ...s,
        tree: s.tree === null ? null : removeLeaf(s.tree, id),
        focus: s.focus === id ? null : s.focus,
      };
    }
    const rects = computeLayout(s, frame ?? FALLBACK_FRAME).rects;
    return { ...s, tree: insertAtLargest(s.tree, id, rects), focus: id };
  });
}

export function toggleWindow(id: WinId, frame?: Rect): void {
  setWindowOpen(id, !isOpen(windowsStore.state, id), frame);
}

export function toggleShade(id: WinId): void {
  windowsStore.setState((s) => ({
    ...s,
    shaded: { ...s.shaded, [id]: s.shaded[id] !== true },
  }));
}

export function setRatio(path: string, ratio: number): void {
  windowsStore.setState((s) =>
    s.tree === null ? s : { ...s, tree: setRatioAt(s.tree, path, ratio) },
  );
}

/** commit a drag: swap in place, or re-home beside the target */
export function dropWindow(dragId: WinId, targetId: WinId, zone: DropZone): void {
  windowsStore.setState((s) =>
    s.tree === null
      ? s
      : { ...s, tree: moveLeaf(s.tree, dragId, targetId, zone), focus: dragId },
  );
}

/** commit a drag past the workspace edge */
export function dropWindowAtEdge(dragId: WinId, side: Exclude<DropZone, "swap">): void {
  windowsStore.setState((s) =>
    s.tree === null ? s : { ...s, tree: attachToRoot(s.tree, dragId, side), focus: dragId },
  );
}

/** Alt+Shift+arrow: swap the focused window with its visual neighbor */
export function moveFocused(side: Exclude<DropZone, "swap">, frame: Rect): void {
  const state = windowsStore.state;
  const focus = state.focus;
  if (state.tree === null || focus === null) {
    return;
  }
  const neighbor = neighborOf(computeLayout(state, frame).rects, focus, side);
  if (neighbor === null) {
    return;
  }
  windowsStore.setState((s) =>
    s.tree === null ? s : { ...s, tree: swapLeaves(s.tree, focus, neighbor) },
  );
}

export function resetLayout(): void {
  windowsStore.setState(() => DEFAULT_WINDOWS);
}

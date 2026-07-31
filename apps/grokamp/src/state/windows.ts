import { Store } from "@tanstack/store";
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

export interface WinRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface WinState extends WinRect {
  readonly open: boolean;
  readonly shaded: boolean;
}

export interface WindowsState {
  /** back-to-front stacking order */
  readonly order: readonly WinId[];
  readonly wins: Readonly<Record<WinId, WinState>>;
}

/**
 * Classic dock: main/tuner/queue stacked on the left like winamp's
 * main/eq/playlist tower, terminal + vis to the right.
 */
const DEFAULT_WINDOWS: WindowsState = {
  order: [
    "todos",
    "mcp",
    "skinlab",
    "museum",
    "vis",
    "terminal",
    "queue",
    "tuner",
    "head",
    "main",
  ],
  wins: {
    // the classic-skin head unit: fixed 275x116 at 2x, chromeless
    head: { x: 640, y: 40, w: 550, h: 232, open: false, shaded: false },
    museum: { x: 540, y: 160, w: 470, h: 434, open: false, shaded: false },
    main: { x: 16, y: 16, w: 550, h: 232, open: true, shaded: false },
    tuner: { x: 16, y: 248, w: 550, h: 232, open: true, shaded: false },
    queue: { x: 16, y: 480, w: 550, h: 318, open: true, shaded: false },
    terminal: { x: 566, y: 16, w: 620, h: 464, open: true, shaded: false },
    vis: { x: 566, y: 480, w: 620, h: 318, open: true, shaded: false },
    todos: { x: 640, y: 80, w: 370, h: 302, open: false, shaded: false },
    mcp: { x: 700, y: 140, w: 370, h: 220, open: false, shaded: false },
    skinlab: { x: 760, y: 200, w: 370, h: 320, open: false, shaded: false },
  },
};

function decodeWindows(raw: unknown): WindowsState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as { order?: unknown; wins?: unknown };
  if (!Array.isArray(record.order) || typeof record.wins !== "object" || record.wins === null) {
    return null;
  }
  const wins = { ...DEFAULT_WINDOWS.wins };
  const rawWins = record.wins as Record<string, unknown>;
  for (const id of WIN_IDS) {
    const w = rawWins[id];
    if (typeof w === "object" && w !== null) {
      const candidate = w as Record<string, unknown>;
      const def = DEFAULT_WINDOWS.wins[id];
      wins[id] = {
        x: typeof candidate["x"] === "number" ? candidate["x"] : def.x,
        y: typeof candidate["y"] === "number" ? candidate["y"] : def.y,
        w: typeof candidate["w"] === "number" ? candidate["w"] : def.w,
        h: typeof candidate["h"] === "number" ? candidate["h"] : def.h,
        open: typeof candidate["open"] === "boolean" ? candidate["open"] : def.open,
        shaded: typeof candidate["shaded"] === "boolean" ? candidate["shaded"] : def.shaded,
      };
    }
  }
  const order = record.order.filter((id): id is WinId =>
    (WIN_IDS as readonly string[]).includes(String(id)),
  );
  for (const id of WIN_IDS) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }
  return { order, wins };
}

export const windowsStore = new Store<WindowsState>(
  loadPersisted("windows", decodeWindows) ?? DEFAULT_WINDOWS,
);

const persistWindows = debounced(() => {
  savePersisted("windows", windowsStore.state);
}, 300);

windowsStore.subscribe(persistWindows);

export function getWin(state: WindowsState, id: WinId): WinState {
  return state.wins[id];
}

export function focusWindow(id: WinId): void {
  windowsStore.setState((s) => {
    if (s.order[s.order.length - 1] === id) {
      return s;
    }
    return { ...s, order: [...s.order.filter((w) => w !== id), id] };
  });
}

export function setWindowOpen(id: WinId, open: boolean): void {
  windowsStore.setState((s) => ({
    ...s,
    wins: { ...s.wins, [id]: { ...s.wins[id], open } },
    order: open ? [...s.order.filter((w) => w !== id), id] : s.order,
  }));
}

export function toggleWindow(id: WinId): void {
  setWindowOpen(id, !windowsStore.state.wins[id].open);
}

export function moveWindow(id: WinId, x: number, y: number): void {
  windowsStore.setState((s) => ({
    ...s,
    wins: { ...s.wins, [id]: { ...s.wins[id], x, y } },
  }));
}

export function resizeWindow(id: WinId, w: number, h: number): void {
  windowsStore.setState((s) => ({
    ...s,
    wins: { ...s.wins, [id]: { ...s.wins[id], w, h } },
  }));
}

export function toggleShade(id: WinId): void {
  windowsStore.setState((s) => ({
    ...s,
    wins: { ...s.wins, [id]: { ...s.wins[id], shaded: !s.wins[id].shaded } },
  }));
}

export function resetLayout(): void {
  windowsStore.setState(() => DEFAULT_WINDOWS);
}

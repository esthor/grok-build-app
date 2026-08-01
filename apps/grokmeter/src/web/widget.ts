// Widget ("meter") contract. A widget mounts into a panel body, subscribes
// to the store, and may return a tick handler for animation frames.

import type { Store } from "./store.ts";

export type WidgetStatus = "" | "ok" | "run" | "warn" | "bad";

export type WidgetCtx = {
  store: Store;
  body: HTMLElement;
  head: HTMLElement;
  setStatus: (cls: WidgetStatus) => void;
};

export type WidgetHandle = {
  tick?: (now: number) => void;
};

export type WidgetDef = {
  id: string;
  label: string;
  /** Preferred design column (0-3) and stacking order within it. */
  col: number;
  order: number;
  /** Design height in px. */
  h: number;
  mount: (ctx: WidgetCtx) => WidgetHandle | undefined;
};

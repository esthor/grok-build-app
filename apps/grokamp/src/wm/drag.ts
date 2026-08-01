import { Store } from "@tanstack/store";
import type { WinId } from "../state/windows";
import {
  dropWindow,
  dropWindowAtEdge,
  focusWindow,
  windowsStore,
  computeLayout,
} from "../state/windows";
import { leafAt, rootEdge, zoneFor, type DropZone, type Rect } from "./tile";

/**
 * Window dragging, shared by the chrome (Window.tsx) and the frameless
 * head unit. The rule from docs/WINDOWING.md: the user must see the exact
 * rect they'll get before releasing, so the drag state carries a resolved
 * target that the overlay renders as a ghost.
 */

export type DragTarget =
  | { readonly kind: "leaf"; readonly id: WinId; readonly zone: DropZone }
  | { readonly kind: "edge"; readonly side: Exclude<DropZone, "swap"> };

export interface DragState {
  readonly id: WinId | null;
  readonly pointer: { readonly x: number; readonly y: number } | null;
  readonly target: DragTarget | null;
}

export const dragStore = new Store<DragState>({ id: null, pointer: null, target: null });

export function beginDrag(id: WinId): void {
  focusWindow(id);
  dragStore.setState(() => ({ id, pointer: null, target: null }));
}

/** resolve the pointer against the current layout; workspace-local coords */
export function updateDrag(x: number, y: number, frame: Rect): void {
  const dragId = dragStore.state.id;
  if (dragId === null) {
    return;
  }
  const rects = computeLayout(windowsStore.state, frame).rects;
  const edge = rootEdge(frame, x, y);
  const overId = leafAt(rects, x, y);
  let target: DragTarget | null = null;
  if (edge !== null) {
    target = { kind: "edge", side: edge };
  } else if (overId !== null && overId !== dragId) {
    const rect = rects.get(overId);
    if (rect !== undefined) {
      target = { kind: "leaf", id: overId, zone: zoneFor(rect, x, y) };
    }
  }
  dragStore.setState((s) => ({ ...s, pointer: { x, y }, target }));
}

export function endDrag(): void {
  const { id, target } = dragStore.state;
  dragStore.setState(() => ({ id: null, pointer: null, target: null }));
  if (id === null || target === null) {
    return; // released over nothing actionable: layout unchanged
  }
  if (target.kind === "edge") {
    dropWindowAtEdge(id, target.side);
  } else {
    dropWindow(id, target.id, target.zone);
  }
}

export function cancelDrag(): void {
  dragStore.setState(() => ({ id: null, pointer: null, target: null }));
}

export const ZONE_LABEL: Readonly<Record<DropZone, string>> = {
  left: "SPLIT LEFT",
  right: "SPLIT RIGHT",
  top: "SPLIT TOP",
  bottom: "SPLIT BOTTOM",
  swap: "SWAP",
};

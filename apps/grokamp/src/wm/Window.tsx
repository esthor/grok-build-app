import { useStore } from "@tanstack/react-store";
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  focusWindow,
  getWin,
  moveWindow,
  resizeWindow,
  setWindowOpen,
  toggleShade,
  windowsStore,
  type WinId,
} from "../state/windows";
import { clampToViewport, quantizeSize, snapPosition, type Rect, type Size } from "./snap";

export const SHADE_H = 28;

export interface ResizeSpec {
  readonly min: Size;
  readonly step: Size;
}

interface WindowProps {
  readonly id: WinId;
  readonly title: string;
  readonly resize?: ResizeSpec;
  readonly children: ReactNode;
}

function desktopSize(): Size {
  const el = document.getElementById("desktop");
  if (el === null) {
    return { w: window.innerWidth, h: window.innerHeight };
  }
  return { w: el.clientWidth, h: el.clientHeight };
}

function siblingRects(exclude: WinId): Rect[] {
  const state = windowsStore.state;
  const rects: Rect[] = [];
  for (const [key, win] of Object.entries(state.wins)) {
    if (key === exclude || !win.open) {
      continue;
    }
    rects.push({ x: win.x, y: win.y, w: win.w, h: win.shaded ? SHADE_H : win.h });
  }
  return rects;
}

export function Win({ id, title, resize, children }: WindowProps): ReactNode {
  const win = useStore(windowsStore, (s) => getWin(s, id));
  const zIndex = useStore(windowsStore, (s) => 10 + s.order.indexOf(id));
  const focused = useStore(
    windowsStore,
    (s) => s.order[s.order.length - 1] === id,
  );
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(
    null,
  );
  const sizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);

  if (!win.open) {
    return null;
  }

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) {
      return;
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, winX: win.x, winY: win.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTitlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }
    const state = windowsStore.state.wins[id];
    const h = state.shaded ? SHADE_H : state.h;
    const proposed: Rect = {
      x: drag.winX + (e.clientX - drag.startX),
      y: drag.winY + (e.clientY - drag.startY),
      w: state.w,
      h,
    };
    const snapped = snapPosition(proposed, siblingRects(id), desktopSize());
    const clamped = clampToViewport({ ...proposed, ...snapped }, desktopSize());
    moveWindow(id, clamped.x, clamped.y);
  };

  const onTitlePointerUp = (): void => {
    dragRef.current = null;
  };

  const onGripPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || resize === undefined) {
      return;
    }
    e.stopPropagation();
    sizeRef.current = { startX: e.clientX, startY: e.clientY, w: win.w, h: win.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onGripPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const start = sizeRef.current;
    if (start === null || resize === undefined) {
      return;
    }
    const next = quantizeSize(
      start.w + (e.clientX - start.startX),
      start.h + (e.clientY - start.startY),
      resize.min,
      resize.step,
    );
    resizeWindow(id, next.w, next.h);
  };

  const onGripPointerUp = (): void => {
    sizeRef.current = null;
  };

  return (
    <section
      className="win"
      data-win={id}
      data-focused={focused ? "yes" : "no"}
      data-shaded={win.shaded ? "yes" : "no"}
      style={{
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.shaded ? SHADE_H : win.h,
        zIndex,
      }}
      onPointerDownCapture={() => {
        focusWindow(id);
      }}
    >
      <div
        className="win-title"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onDoubleClick={() => {
          toggleShade(id);
        }}
      >
        <span className="win-title-notch" aria-hidden="true" />
        <span className="win-title-text">{title}</span>
        <span className="win-title-notch" aria-hidden="true" />
        <span className="win-title-buttons">
          <button
            type="button"
            className="win-btn"
            title={win.shaded ? "unroll" : "windowshade"}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={() => {
              toggleShade(id);
            }}
          >
            {win.shaded ? "▾" : "▴"}
          </button>
          <button
            type="button"
            className="win-btn"
            title="close"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={() => {
              setWindowOpen(id, false);
            }}
          >
            ✕
          </button>
        </span>
      </div>
      {!win.shaded && <div className="win-body">{children}</div>}
      {!win.shaded && resize !== undefined && (
        <div
          className="win-grip"
          title="resize"
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
        />
      )}
    </section>
  );
}

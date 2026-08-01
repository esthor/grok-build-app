import { useStore } from "@tanstack/react-store";
import { type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  focusWindow,
  setWindowOpen,
  toggleShade,
  windowsStore,
  type WinId,
} from "../state/windows";
import { beginDrag, dragStore, updateDrag } from "./drag";
import type { Rect } from "./tile";

interface WindowProps {
  readonly id: WinId;
  readonly title: string;
  /** computed by the tiler — windows never position themselves */
  readonly rect: Rect;
  readonly frame: Rect;
  readonly children: ReactNode;
}

export function Win({ id, title, rect, frame, children }: WindowProps): ReactNode {
  const shaded = useStore(windowsStore, (s) => s.shaded[id] === true);
  const focused = useStore(windowsStore, (s) => s.focus === id);
  const dragging = useStore(dragStore, (s) => s.id === id);

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    beginDrag(id);
  };

  const onTitlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragStore.state.id !== id) {
      return;
    }
    const host = document.getElementById("desktop");
    if (host === null) {
      return;
    }
    const box = host.getBoundingClientRect();
    updateDrag(e.clientX - box.left, e.clientY - box.top, frame);
  };

  return (
    <section
      className="win"
      data-win={id}
      data-focused={focused ? "yes" : "no"}
      data-shaded={shaded ? "yes" : "no"}
      data-dragging={dragging ? "yes" : "no"}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDownCapture={() => {
        focusWindow(id);
      }}
    >
      <div
        className="win-title"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onDoubleClick={() => {
          toggleShade(id);
        }}
        title="drag onto another window to split or swap · double-click to roll up"
      >
        <span className="win-title-notch" aria-hidden="true" />
        <span className="win-title-text">{title}</span>
        <span className="win-title-notch" aria-hidden="true" />
        <span className="win-title-buttons">
          <button
            type="button"
            className="win-btn"
            title={shaded ? "unroll" : "windowshade"}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={() => {
              toggleShade(id);
            }}
          >
            {shaded ? "▾" : "▴"}
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
      {!shaded && <div className="win-body">{children}</div>}
    </section>
  );
}

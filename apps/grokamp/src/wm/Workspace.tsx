import { useStore } from "@tanstack/react-store";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { computeLayout, setRatio, windowsStore } from "../state/windows";
import { WINDOW_DEFS } from "../tiles/registry";
import { dragStore, endDrag, updateDrag, ZONE_LABEL } from "./drag";
import { previewRect, type Divider, type Rect } from "./tile";
import { Win } from "./Window";

/**
 * The tiling workspace: measures itself, computes every pane's rect from the
 * partition tree, and renders panes + dividers + the drop-zone ghost.
 * Windows are positioned exclusively from the tree, so overlap can't happen.
 */
export function Workspace(): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const windows = useStore(windowsStore);
  const drag = useStore(dragStore);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const measure = (): void => {
      setFrame({ x: 0, y: 0, w: host.clientWidth, h: host.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => {
      observer.disconnect();
    };
  }, []);

  // a drag can end anywhere (including outside the window)
  useEffect(() => {
    const onUp = (): void => {
      if (dragStore.state.id !== null) {
        endDrag();
      }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragStore.state.id === null) {
      return;
    }
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const box = host.getBoundingClientRect();
    updateDrag(e.clientX - box.left, e.clientY - box.top, frame);
  };

  const { rects, dividers } = computeLayout(windows, frame);

  const ghost = ((): Rect | null => {
    if (drag.target === null) {
      return null;
    }
    if (drag.target.kind === "edge") {
      const side = drag.target.side;
      const third = Math.round((side === "left" || side === "right" ? frame.w : frame.h) * 0.32);
      switch (side) {
        case "left":
          return { x: 0, y: 0, w: third, h: frame.h };
        case "right":
          return { x: frame.w - third, y: 0, w: third, h: frame.h };
        case "top":
          return { x: 0, y: 0, w: frame.w, h: third };
        case "bottom":
          return { x: 0, y: frame.h - third, w: frame.w, h: third };
      }
    }
    const rect = rects.get(drag.target.id);
    return rect === undefined ? null : previewRect(rect, drag.target.zone);
  })();

  const ghostLabel =
    drag.target === null
      ? ""
      : drag.target.kind === "edge"
        ? `DOCK ${drag.target.side.toUpperCase()}`
        : ZONE_LABEL[drag.target.zone];

  return (
    <div
      id="desktop"
      ref={hostRef}
      onPointerMove={onPointerMove}
      data-dragging={drag.id === null ? "no" : "yes"}
    >
      {[...rects].map(([id, rect]) => {
        const def = WINDOW_DEFS[id];
        if (def.frameless === true) {
          return <def.component key={id} rect={rect} frame={frame} />;
        }
        return (
          <Win key={id} id={id} rect={rect} title={def.title} frame={frame}>
            <def.component rect={rect} frame={frame} />
          </Win>
        );
      })}

      {dividers.map((divider) => (
        <DividerHandle key={divider.path} divider={divider} />
      ))}

      {ghost !== null && (
        <div
          className="drop-ghost"
          style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}
        >
          <span className="drop-ghost-label">{ghostLabel}</span>
        </div>
      )}

      {rects.size === 0 && (
        <div className="workspace-empty">
          every window is closed — use the deck buttons or Alt+1…9
        </div>
      )}

      <div className="desktop-tag" aria-hidden="true">
        GROKAMP · drag a titlebar onto another window to split or swap · type llama
      </div>
    </div>
  );
}

/** the gutter between two panes: drag to re-apportion, never to overlap */
function DividerHandle({ divider }: { readonly divider: Divider }): ReactNode {
  const active = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) {
      return;
    }
    active.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active.current) {
      return;
    }
    const host = document.getElementById("desktop");
    if (host === null) {
      return;
    }
    const box = host.getBoundingClientRect();
    const isRow = divider.dir === "row";
    // pointer → fraction of the split's own extent; the tiler clamps the rest
    const local = isRow ? e.clientX - box.left : e.clientY - box.top;
    const origin = isRow ? divider.parent.x : divider.parent.y;
    const extent = isRow ? divider.parent.w : divider.parent.h;
    if (extent <= 0) {
      return;
    }
    setRatio(divider.path, (local - origin) / extent);
  };

  const onPointerUp = (): void => {
    active.current = false;
  };

  return (
    <div
      className={`divider divider-${divider.dir}`}
      style={{
        left: divider.rect.x,
        top: divider.rect.y,
        width: divider.rect.w,
        height: divider.rect.h,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="separator"
      aria-orientation={divider.dir === "row" ? "vertical" : "horizontal"}
    />
  );
}

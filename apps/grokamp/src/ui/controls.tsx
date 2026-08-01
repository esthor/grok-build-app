import {
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export function Led({
  on,
  color = "var(--sk-ok)",
  label,
}: {
  readonly on: boolean;
  readonly color?: string;
  readonly label?: string;
}): ReactNode {
  return (
    <span className="led-wrap" title={label}>
      <span
        className="led"
        style={
          on
            ? { background: color, boxShadow: `0 0 6px ${color}` }
            : { background: "var(--sk-ledOff)" }
        }
      />
      {label !== undefined && <span className="led-label">{label}</span>}
    </span>
  );
}

export function SquareBtn({
  children,
  onClick,
  title,
  lit = false,
  wide = false,
  disabled = false,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly title: string;
  readonly lit?: boolean;
  readonly wide?: boolean;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      className={`sq-btn${wide ? " sq-btn-wide" : ""}`}
      data-lit={lit ? "yes" : "no"}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

interface SliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly vertical?: boolean;
  readonly title?: string;
  /** paint a center detent tick (balance-style sliders) */
  readonly detent?: boolean;
}

/** chunky winamp fader with pointer capture */
export function Slider({
  value,
  min,
  max,
  onChange,
  vertical = false,
  title,
  detent = false,
}: SliderProps): ReactNode {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const valueFromPointer = (e: ReactPointerEvent<HTMLDivElement>): number => {
    const track = trackRef.current;
    if (track === null) {
      return value;
    }
    const rect = track.getBoundingClientRect();
    const t = vertical
      ? 1 - (e.clientY - rect.top) / rect.height
      : (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, t));
    return Math.round(min + clamped * (max - min));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueFromPointer(e));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.buttons === 1) {
      onChange(valueFromPointer(e));
    }
  };

  const t = max === min ? 0 : (value - min) / (max - min);
  const pct = `${(t * 100).toFixed(1)}%`;

  return (
    <div
      className={`slider ${vertical ? "slider-v" : "slider-h"}`}
      ref={trackRef}
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={title}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = Math.max(1, Math.round((max - min) / 20));
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          onChange(Math.min(max, value + step));
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          onChange(Math.max(min, value - step));
        }
      }}
    >
      <div className="slider-groove" />
      {detent && <div className="slider-detent" />}
      <div
        className="slider-thumb"
        style={vertical ? { bottom: `calc(${pct} - 7px)` } : { left: `calc(${pct} - 11px)` }}
      />
    </div>
  );
}

/** tiny lcd-style text chip */
export function LcdText({
  children,
  dim = false,
  accent = false,
}: {
  readonly children: ReactNode;
  readonly dim?: boolean;
  readonly accent?: boolean;
}): ReactNode {
  return (
    <span
      className="lcd-text"
      style={{
        color: accent
          ? "var(--sk-lcdAccent)"
          : dim
            ? "var(--sk-lcdDim)"
            : "var(--sk-lcdText)",
      }}
    >
      {children}
    </span>
  );
}

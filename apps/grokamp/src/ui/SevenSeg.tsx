import type { ReactNode } from "react";

/**
 * CSS-free 7-segment LCD digits drawn as SVG. Segment ids:
 *      aaaa
 *     f    b
 *      gggg
 *     e    c
 *      dddd
 */
const SEGMENTS: Record<string, readonly string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
  " ": [],
};

const SEG_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 2, y: 0, w: 8, h: 2.6 },
  b: { x: 9.4, y: 1.6, w: 2.6, h: 8 },
  c: { x: 9.4, y: 10.4, w: 2.6, h: 8 },
  d: { x: 2, y: 17.4, w: 8, h: 2.6 },
  e: { x: 0, y: 10.4, w: 2.6, h: 8 },
  f: { x: 0, y: 1.6, w: 2.6, h: 8 },
  g: { x: 2, y: 8.7, w: 8, h: 2.6 },
};

interface SevenSegProps {
  readonly text: string;
  /** css height, digits keep 12:20 aspect */
  readonly height: number;
  readonly dimUnlit?: boolean;
}

function Digit({ char, height, dimUnlit }: { char: string; height: number; dimUnlit: boolean }): ReactNode {
  if (char === ":") {
    return (
      <svg viewBox="0 0 5 20" height={height} className="sseg" aria-hidden="true">
        <rect x="1.2" y="5" width="2.6" height="2.6" fill="var(--sk-lcdText)" />
        <rect x="1.2" y="12.4" width="2.6" height="2.6" fill="var(--sk-lcdText)" />
      </svg>
    );
  }
  const lit = SEGMENTS[char] ?? [];
  return (
    <svg viewBox="0 0 12 20" height={height} className="sseg" aria-hidden="true">
      {Object.entries(SEG_RECTS).map(([seg, r]) => {
        const on = lit.includes(seg);
        if (!on && !dimUnlit) {
          return null;
        }
        return (
          <rect
            key={seg}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={on ? "var(--sk-lcdText)" : "var(--sk-lcdDim)"}
            opacity={on ? 1 : 0.22}
          />
        );
      })}
    </svg>
  );
}

export function SevenSeg({ text, height, dimUnlit = true }: SevenSegProps): ReactNode {
  return (
    <span className="sseg-row" role="img" aria-label={text}>
      {text.split("").map((char, i) => (
        // eslint-disable-next-line react/no-array-index-key -- positional digits
        <Digit key={i} char={char} height={height} dimUnlit={dimUnlit} />
      ))}
    </span>
  );
}

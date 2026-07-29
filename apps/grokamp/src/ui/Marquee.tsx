import { useEffect, useRef, type ReactNode } from "react";

interface MarqueeProps {
  readonly text: string;
}

/**
 * The song ticker, done the 1997 way: winamp stepped one 5px bitmap-font
 * character every 220ms, looped the text as `text + "  ***  " + text`, and
 * only scrolled at all when the title overflowed the window.
 */
const SEPARATOR = "  ***  ";
const TICK_MS = 220;

export function Marquee({ text }: MarqueeProps): ReactNode {
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const content = text.toUpperCase() + SEPARATOR;
    let steps = 0;
    const id = setInterval(() => {
      const el = innerRef.current;
      const container = el?.parentElement ?? null;
      if (el === null || container === null) {
        return;
      }
      const half = el.scrollWidth / 2;
      if (half <= container.clientWidth) {
        el.style.transform = "translateX(0)";
        return;
      }
      const charW = half / content.length;
      steps += 1;
      const offset = Math.floor((steps * charW) % half);
      el.style.transform = `translateX(${-offset}px)`;
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, [text]);

  const content = text.toUpperCase() + SEPARATOR;
  return (
    <div className="marquee" title={text}>
      <div className="marquee-inner" ref={innerRef}>
        <span>{content}</span>
        <span>{content}</span>
      </div>
    </div>
  );
}

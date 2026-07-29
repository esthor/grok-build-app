// CONTEXT RING — the deck's hero gauge: context-window occupancy as a
// Roundline arc with degree ticks and counter-rotating decorative rings.

import { arcPath, el, fmtTokens, polar, svg } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

const A0 = -135;
const A1 = 135;
const SWEEP = A1 - A0;

export const contextRingWidget: WidgetDef = {
  id: "context-ring",
  label: "CONTEXT // WINDOW",
  col: 2,
  order: 0,
  h: 236,
  mount({ store, body, setStatus }) {
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.alignItems = "center";

    const size = 172;
    const c = size / 2;
    const rMain = 62;
    const root = svg("svg", {
      width: `${size}`,
      height: `${size}`,
      viewBox: `0 0 ${size} ${size}`,
    });

    // Decorative rotator rings (the JARVIS signature).
    const ringOuter = svg("circle", {
      cx: `${c}`,
      cy: `${c}`,
      r: "80",
      fill: "none",
      stroke: "rgba(var(--accent-rgb), 0.22)",
      "stroke-width": "1",
      "stroke-dasharray": "2 9 34 9",
    });
    ringOuter.classList.add("rot-slow");
    const ringInner = svg("circle", {
      cx: `${c}`,
      cy: `${c}`,
      r: "50",
      fill: "none",
      stroke: "rgba(var(--accent-rgb), 0.16)",
      "stroke-width": "1",
      "stroke-dasharray": "1 6 18 6",
    });
    ringInner.classList.add("rot-rev");

    // Degree ticks every 10% of the sweep.
    const ticks = svg("g", {});
    for (let i = 0; i <= 10; i += 1) {
      const a = A0 + (SWEEP * i) / 10;
      const [x0, y0] = polar(c, c, rMain + 7, a);
      const [x1, y1] = polar(c, c, rMain + (i % 5 === 0 ? 13 : 10), a);
      ticks.append(
        svg("line", {
          x1: `${x0}`,
          y1: `${y0}`,
          x2: `${x1}`,
          y2: `${y1}`,
          stroke: i % 5 === 0 ? "rgba(var(--accent-rgb), 0.5)" : "rgba(var(--accent-rgb), 0.25)",
          "stroke-width": "1",
        }),
      );
    }

    const track = svg("path", {
      d: arcPath(c, c, rMain, A0, A1),
      fill: "none",
      stroke: "rgba(var(--accent-rgb), 0.13)",
      "stroke-width": "7",
    });
    const val = svg("path", {
      d: arcPath(c, c, rMain, A0, A0),
      fill: "none",
      stroke: "var(--accent)",
      "stroke-width": "7",
    });
    val.style.filter = "drop-shadow(0 0 6px var(--glow))";

    const pct = svg("text", {
      x: `${c}`,
      y: `${c - 2}`,
      "text-anchor": "middle",
      fill: "var(--ink)",
      "font-size": "34",
      "font-family": "var(--font-thin)",
      "font-weight": "200",
    });
    pct.textContent = "—";
    const pctLabel = svg("text", {
      x: `${c}`,
      y: `${c + 16}`,
      "text-anchor": "middle",
      fill: "var(--dim)",
      "font-size": "8",
      "letter-spacing": "2",
      "font-family": "var(--font-mono)",
    });
    pctLabel.textContent = "OF WINDOW";

    root.append(ringOuter, ringInner, ticks, track, val, pct, pctLabel);

    const tokens = el("div", "", "— / —");
    tokens.style.fontSize = "12px";
    tokens.style.fontVariantNumeric = "tabular-nums";
    tokens.style.marginTop = "-6px";
    const meta = el("div", "micro", "");
    meta.style.marginTop = "4px";

    body.append(root, tokens, meta);

    store.on("agent", (agent) => {
      if (agent === null) {
        pct.textContent = "—";
        tokens.textContent = "— / —";
        meta.textContent = "NO SESSION";
        val.setAttribute("d", arcPath(c, c, rMain, A0, A0));
        setStatus("");
        return;
      }
      const frac = Math.min(1, agent.contextUsedTokens / Math.max(1, agent.contextWindowTokens));
      val.setAttribute("d", arcPath(c, c, rMain, A0, A0 + frac * SWEEP));
      const color = frac > 0.85 ? "var(--bad)" : frac > 0.6 ? "var(--warn)" : "var(--accent)";
      val.setAttribute("stroke", color);
      pct.textContent = `${Math.round(frac * 100)}%`;
      tokens.textContent = `${fmtTokens(agent.contextUsedTokens)} / ${fmtTokens(agent.contextWindowTokens)} TOK`;
      meta.textContent = `COMPACTIONS ${agent.compactionCount} · MSGS ${agent.userMessages + agent.assistantMessages}`;
      setStatus(frac > 0.85 ? "bad" : frac > 0.6 ? "warn" : "ok");
    });
    return undefined;
  },
};

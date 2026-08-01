// MEMORY — Roundline arc gauge with used/total readout.

import { arcPath, el, fmtBytes, svg } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

const A0 = -135;
const A1 = 135;

export const memWidget: WidgetDef = {
  id: "mem",
  label: "MEMORY // PRESSURE",
  col: 0,
  order: 2,
  h: 112,
  mount({ store, body, setStatus }) {
    body.style.display = "flex";
    body.style.gap = "12px";
    body.style.alignItems = "center";

    const size = 74;
    const c = size / 2;
    const r = 30;
    const svgRoot = svg("svg", {
      width: `${size}`,
      height: `${size}`,
      viewBox: `0 0 ${size} ${size}`,
    });
    svgRoot.style.flex = "none";
    const track = svg("path", {
      d: arcPath(c, c, r, A0, A1),
      fill: "none",
      stroke: "rgba(var(--accent-rgb), 0.14)",
      "stroke-width": "5",
    });
    const val = svg("path", {
      d: arcPath(c, c, r, A0, A0),
      fill: "none",
      stroke: "var(--accent)",
      "stroke-width": "5",
      "stroke-linecap": "butt",
    });
    val.style.filter = "drop-shadow(0 0 4px var(--glow))";
    const pctText = svg("text", {
      x: `${c}`,
      y: `${c + 4}`,
      "text-anchor": "middle",
      fill: "var(--ink)",
      "font-size": "14",
      "font-family": "var(--font-thin)",
      "font-weight": "300",
    });
    pctText.textContent = "—";
    svgRoot.append(track, val, pctText);

    const right = el("div");
    right.style.flex = "1";
    const rows: [string, HTMLElement][] = (
      [
        ["USED", el("span", "v")],
        ["WIRED", el("span", "v")],
        ["COMPRESSED", el("span", "v")],
      ] as [string, HTMLElement][]
    ).map(([k, v]) => {
      const kv = el("div", "kv");
      const key = el("span", "k", k);
      kv.append(key, v);
      right.append(kv);
      return [k, v];
    });

    body.append(svgRoot, right);

    store.on("sys", (sys) => {
      if (sys.mem.totalBytes <= 0) {
        // Sampling failure: show absence, not NaN dressed up as healthy.
        pctText.textContent = "—";
        val.setAttribute("d", arcPath(c, c, r, A0, A0));
        setStatus("");
        return;
      }
      const frac = sys.mem.usedBytes / sys.mem.totalBytes;
      val.setAttribute("d", arcPath(c, c, r, A0, A0 + frac * (A1 - A0)));
      val.setAttribute("stroke", frac > 0.9 ? "var(--bad)" : frac > 0.75 ? "var(--warn)" : "var(--accent)");
      pctText.textContent = `${Math.round(frac * 100)}%`;
      const used = rows[0]?.[1];
      const wired = rows[1]?.[1];
      const comp = rows[2]?.[1];
      if (used !== undefined) used.textContent = `${fmtBytes(sys.mem.usedBytes)} / ${fmtBytes(sys.mem.totalBytes)}`;
      if (wired !== undefined) wired.textContent = fmtBytes(sys.mem.wiredBytes);
      if (comp !== undefined) comp.textContent = fmtBytes(sys.mem.compressedBytes);
      setStatus(frac > 0.9 ? "bad" : frac > 0.75 ? "warn" : "ok");
    });
    return undefined;
  },
};

// CPU — total load readout plus per-core segmented bars (the genre's spine).

import { Spark, cssVar, el } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const cpuWidget: WidgetDef = {
  id: "cpu",
  label: "CPU // CORES",
  col: 0,
  order: 1,
  h: 150,
  mount({ store, body, setStatus }) {
    const top = el("div");
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.alignItems = "baseline";
    top.style.marginBottom = "8px";

    const pct = el("span", "display-num");
    pct.style.fontSize = "30px";
    pct.textContent = "—";
    const load = el("span", "micro", "LOAD —");
    top.append(pct, load);

    const grid = el("div", "corebars");
    // Fallback for hosts where per-core load isn't readable (macOS without
    // privileges): one wide LED bar of total load + a history trace.
    const totalWrap = el("div");
    totalWrap.style.display = "none";
    const totalTrack = el("div", "bar-track");
    totalTrack.style.height = "10px";
    totalTrack.style.marginTop = "2px";
    const totalFill = el("div", "bar-fill");
    totalTrack.append(totalFill);
    const spark = new Spark(150);
    spark.canvas.style.width = "100%";
    spark.canvas.style.height = "40px";
    spark.canvas.style.display = "block";
    spark.canvas.style.marginTop = "10px";
    totalWrap.append(totalTrack, spark.canvas);

    body.append(top, grid, totalWrap);

    const bars: { fill: HTMLElement }[] = [];
    const ensureBars = (n: number): void => {
      while (bars.length < n) {
        const wrap = el("div", "corebar");
        const lab = el("span", "micro", bars.length.toString().padStart(2, "0"));
        const track = el("div", "bar-track");
        const fill = el("div", "bar-fill");
        track.append(fill);
        wrap.append(lab, track);
        grid.append(wrap);
        bars.push({ fill });
      }
    };

    store.on("sys", (sys) => {
      const total = sys.cpu.totalPct;
      pct.textContent = `${total.toFixed(0)}%`;
      load.textContent = `LOAD ${sys.cpu.load1.toFixed(2)} ${sys.cpu.load5.toFixed(2)} ${sys.cpu.load15.toFixed(2)}`;
      setStatus(total > 85 ? "bad" : total > 60 ? "warn" : "ok");
      if (sys.cpu.cores.length > 0) {
        grid.style.display = "";
        totalWrap.style.display = "none";
        ensureBars(sys.cpu.cores.length);
        sys.cpu.cores.forEach((c, i) => {
          const bar = bars[i];
          if (bar === undefined) return;
          bar.fill.style.width = `${Math.min(100, c)}%`;
          bar.fill.className = c > 85 ? "bar-fill bad" : c > 60 ? "bar-fill warn" : "bar-fill";
        });
      } else {
        grid.style.display = "none";
        totalWrap.style.display = "";
        totalFill.style.width = `${Math.min(100, total)}%`;
        totalFill.className = total > 85 ? "bar-fill bad" : total > 60 ? "bar-fill warn" : "bar-fill";
        spark.push(total);
        spark.draw(cssVar("--accent"), { floor: 20 });
      }
    });
    return undefined;
  },
};

// LATENCY PROFILE — time-to-first-token and inter-token latency stats.

import { el } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const latencyWidget: WidgetDef = {
  id: "latency",
  label: "LATENCY // PROFILE",
  col: 2,
  order: 3,
  h: 112,
  mount({ store, body, setStatus }) {
    const grid = el("div", "stat-grid");
    body.append(grid);

    const mk = (label: string, unit = "ms"): HTMLElement => {
      const cell = el("div", "stat-cell");
      const l = el("span", "micro", label);
      const v = el("span", "val", "—");
      cell.append(l, v);
      if (unit !== "") cell.append(el("span", "unit", unit));
      grid.append(cell);
      return v;
    };

    const ttftAvg = mk("TTFT AVG");
    const ttftMin = mk("TTFT MIN");
    const ttftMax = mk("TTFT MAX");
    const itlP50 = mk("ITL P50");
    const itlP99 = mk("ITL P99");
    const turns = mk("TURNS", "");

    store.on("agent", (agent) => {
      if (agent === null) {
        for (const cell of [ttftAvg, ttftMin, ttftMax, itlP50, itlP99, turns]) {
          cell.textContent = "—";
        }
        setStatus("");
        return;
      }
      const ms = (v: number): string => (Number.isFinite(v) ? Math.round(v).toString() : "—");
      ttftAvg.textContent = ms(agent.ttftAvgMs);
      ttftMin.textContent = ms(agent.ttftMinMs);
      ttftMax.textContent = ms(agent.ttftMaxMs);
      itlP50.textContent = ms(agent.itlP50Ms);
      itlP99.textContent = ms(agent.itlP99Ms);
      turns.textContent = Number.isFinite(agent.turnCount) ? agent.turnCount.toString() : "—";
      setStatus(agent.ttftAvgMs > 8000 ? "warn" : "ok");
    });
    return undefined;
  },
};

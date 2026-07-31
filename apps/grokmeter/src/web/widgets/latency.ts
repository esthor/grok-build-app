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
      ttftAvg.textContent = Math.round(agent.ttftAvgMs).toString();
      ttftMin.textContent = Math.round(agent.ttftMinMs).toString();
      ttftMax.textContent = Math.round(agent.ttftMaxMs).toString();
      itlP50.textContent = Math.round(agent.itlP50Ms).toString();
      itlP99.textContent = Math.round(agent.itlP99Ms).toString();
      turns.textContent = agent.turnCount.toString();
      setStatus(agent.ttftAvgMs > 8000 ? "warn" : "ok");
    });
    return undefined;
  },
};

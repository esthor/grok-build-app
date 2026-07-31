// PERMISSION GATE — approval telemetry, with a klaxon band when the agent
// is holding for a human decision.

import { el, fmtClock } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const permissionsWidget: WidgetDef = {
  id: "permissions",
  label: "PERMISSIONS // GATE",
  col: 3,
  order: 2,
  h: 140,
  mount({ store, body, setStatus }) {
    const grid = el("div", "stat-grid");
    const mk = (label: string): HTMLElement => {
      const cell = el("div", "stat-cell");
      const l = el("span", "micro", label);
      const v = el("span", "val", "—");
      cell.append(l, v);
      grid.append(cell);
      return v;
    };
    const req = mk("REQUESTED");
    const denied = mk("DENIED");
    const wait = mk("AVG WAIT");

    const band = el("div", "alert-band", "◆ PERMISSION REQUIRED ◆");
    body.append(grid, band);

    store.on("agent", (agent) => {
      if (agent === null) {
        band.classList.remove("show");
        setStatus("");
        return;
      }
      req.textContent = agent.permsRequested.toString();
      denied.textContent = agent.permsDenied.toString();
      denied.style.color = agent.permsDenied > 0 ? "var(--bad)" : "var(--ink)";
      const waitSec = agent.permAvgWaitMs / 1000;
      wait.textContent = waitSec >= 90 ? fmtClock(waitSec) : `${waitSec.toFixed(1)}s`;
      wait.style.fontSize = "15px";
      band.classList.toggle("show", agent.permPending);
      setStatus(agent.permPending ? "warn" : agent.permsDenied > 0 ? "bad" : "ok");
    });
    return undefined;
  },
};

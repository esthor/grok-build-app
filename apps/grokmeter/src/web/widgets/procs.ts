// PROCESSES — top talkers by CPU.

import { el } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const procsWidget: WidgetDef = {
  id: "procs",
  label: "PROCESSES // TOP",
  col: 0,
  order: 5,
  h: 142,
  mount({ store, body }) {
    const list = el("div");
    body.append(list);

    store.on("sys", (sys) => {
      list.innerHTML = "";
      for (const p of sys.procs.slice(0, 5)) {
        const row = el("div", "proc-row");
        const pid = el("span", "pid", p.pid.toString());
        const name = el("span", "name", p.name);
        const val = el("span", "val", `${p.cpuPct.toFixed(1)}%`);
        row.append(pid, name, val);
        list.append(row);
      }
    });
    return undefined;
  },
};

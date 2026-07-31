// CLOCK — the anchor element of every Rainmeter desktop: huge thin numerals.

import { el } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const clockWidget: WidgetDef = {
  id: "clock",
  label: "CLOCK // LOCAL",
  col: 0,
  order: 0,
  h: 112,
  mount({ body, setStatus }) {
    setStatus("ok");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.justifyContent = "center";

    const row = el("div");
    row.style.display = "flex";
    row.style.alignItems = "baseline";
    row.style.gap = "8px";
    const hm = el("span", "display-num");
    hm.style.fontSize = "52px";
    const sec = el("span", "display-num");
    sec.style.fontSize = "20px";
    sec.style.color = "var(--accent)";
    sec.style.textShadow = "0 0 10px var(--glow)";
    row.append(hm, sec);

    const date = el("div", "micro");
    date.style.marginTop = "8px";

    body.append(row, date);

    let lastSec = -1;
    const render = (): void => {
      const d = new Date();
      if (d.getSeconds() === lastSec) return;
      lastSec = d.getSeconds();
      const pad = (n: number): string => n.toString().padStart(2, "0");
      hm.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      sec.textContent = pad(d.getSeconds());
      const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      // Handle half/quarter-hour zones (UTC+5:30, +5:45, −3:30) properly.
      const offMin = -d.getTimezoneOffset();
      const sign = offMin >= 0 ? "+" : "-";
      const abs = Math.abs(offMin);
      const mm = abs % 60;
      const tzs = `UTC${sign}${Math.floor(abs / 60)}${mm > 0 ? `:${mm.toString().padStart(2, "0")}` : ""}`;
      date.textContent = `${days[d.getDay()] ?? ""} ${pad(d.getDate())} ${months[d.getMonth()] ?? ""} ${d.getFullYear()} · ${tzs}`;
    };
    render();
    return { tick: render };
  },
};

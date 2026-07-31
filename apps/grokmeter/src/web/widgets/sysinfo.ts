// SYSTEM INFO — host identity and uptime; the quiet corner widget.

import { el, fmtDur } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const sysinfoWidget: WidgetDef = {
  id: "sysinfo",
  label: "SYSTEM // INFO",
  col: 3,
  order: 3,
  h: 124,
  mount({ store, body, setStatus }) {
    const mkRow = (key: string): HTMLElement => {
      const kv = el("div", "kv");
      const k = el("span", "k", key);
      const v = el("span", "v", "—");
      kv.append(k, v);
      body.append(kv);
      return v;
    };
    const host = mkRow("HOST");
    const os = mkRow("OS");
    const up = mkRow("UPTIME");
    const deck = mkRow("DECK");

    store.on("sys", (sys) => {
      host.textContent = sys.hostname;
      os.textContent = sys.os;
      up.textContent = fmtDur(sys.uptimeSec);
      setStatus("ok");
    });
    store.on("hello", (info) => {
      deck.textContent = `grokmeter ${info.version} · ${info.mode.toUpperCase()}`;
    });
    return undefined;
  },
};

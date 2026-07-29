// DISK — segmented capacity bar, illustro-style.

import { el, fmtBytes } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const diskWidget: WidgetDef = {
  id: "disk",
  label: "DISK // ROOT",
  col: 0,
  order: 4,
  h: 88,
  mount({ store, body, setStatus }) {
    const track = el("div", "bar-track");
    track.style.height = "8px";
    track.style.marginTop = "6px";
    const fill = el("div", "bar-fill");
    track.append(fill);

    const row = el("div", "kv");
    const k = el("span", "k", "USED");
    const v = el("span", "v", "—");
    row.append(k, v);
    const row2 = el("div", "kv");
    const k2 = el("span", "k", "FREE");
    const v2 = el("span", "v", "—");
    row2.append(k2, v2);

    body.append(track, row, row2);

    store.on("sys", (sys) => {
      if (sys.disk.totalBytes <= 0) {
        fill.style.width = "0%";
        v.textContent = "—";
        v2.textContent = "—";
        setStatus("");
        return;
      }
      const frac = sys.disk.usedBytes / sys.disk.totalBytes;
      fill.style.width = `${(frac * 100).toFixed(1)}%`;
      fill.className = frac > 0.92 ? "bar-fill bad" : frac > 0.8 ? "bar-fill warn" : "bar-fill";
      v.textContent = `${fmtBytes(sys.disk.usedBytes)} / ${fmtBytes(sys.disk.totalBytes)}`;
      v2.textContent = fmtBytes(sys.disk.totalBytes - sys.disk.usedBytes);
      setStatus(frac > 0.92 ? "bad" : "ok");
    });
    return undefined;
  },
};

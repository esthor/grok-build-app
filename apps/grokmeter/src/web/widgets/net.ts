// NETWORK — the classic up/down twin traces with live rates.

import { Spark, cssVar, el, fmtBps } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const netWidget: WidgetDef = {
  id: "net",
  label: "NETWORK // LINK",
  col: 0,
  order: 3,
  h: 132,
  mount({ store, body, setStatus, head }) {
    const iface = el("span", "micro", "");
    iface.style.marginLeft = "auto";
    iface.style.marginRight = "8px";
    head.insertBefore(iface, head.lastChild);

    const mkRow = (label: string): { spark: Spark; rate: HTMLElement } => {
      const wrap = el("div");
      wrap.style.marginBottom = "4px";
      const meta = el("div");
      meta.style.display = "flex";
      meta.style.justifyContent = "space-between";
      meta.style.alignItems = "baseline";
      const lab = el("span", "micro", label);
      const rate = el("span");
      rate.style.fontSize = "11px";
      rate.style.fontVariantNumeric = "tabular-nums";
      meta.append(lab, rate);
      const spark = new Spark(150);
      spark.canvas.style.width = "100%";
      spark.canvas.style.height = "26px";
      spark.canvas.style.display = "block";
      wrap.append(meta, spark.canvas);
      body.append(wrap);
      return { spark, rate };
    };

    const rx = mkRow("▼ RX");
    const tx = mkRow("▲ TX");

    store.on("sys", (sys) => {
      iface.textContent = sys.net.iface.toUpperCase();
      rx.spark.push(sys.net.rxBps);
      tx.spark.push(sys.net.txBps);
      rx.rate.textContent = fmtBps(sys.net.rxBps);
      tx.rate.textContent = fmtBps(sys.net.txBps);
      rx.rate.style.color = sys.net.rxBps > 1e6 ? "var(--accent)" : "var(--ink)";
      tx.rate.style.color = sys.net.txBps > 1e6 ? "var(--accent-2)" : "var(--ink)";
      rx.spark.draw(cssVar("--accent"), { floor: 50_000 });
      tx.spark.draw(cssVar("--accent-2"), { floor: 20_000 });
      setStatus("ok");
    });
    return undefined;
  },
};

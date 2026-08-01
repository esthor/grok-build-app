// TOKEN FLOW — cumulative token odometer plus a tokens-per-second trace.

import { Spark, cssVar, el, fmtTokens } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const tokenFlowWidget: WidgetDef = {
  id: "token-flow",
  label: "TOKENS // FLOW",
  col: 2,
  order: 2,
  h: 148,
  mount({ store, body, setStatus }) {
    const top = el("div");
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.alignItems = "baseline";
    const total = el("span", "display-num", "—");
    total.style.fontSize = "28px";
    const rate = el("span", "", "—");
    rate.style.fontSize = "11px";
    rate.style.color = "var(--dim)";
    rate.style.fontVariantNumeric = "tabular-nums";
    top.append(total, rate);

    const spark = new Spark(150);
    spark.canvas.style.width = "100%";
    spark.canvas.style.height = "44px";
    spark.canvas.style.display = "block";
    spark.canvas.style.marginTop = "8px";

    body.append(top, spark.canvas);

    let lastTokens = -1;
    let lastAt = 0;
    store.on("agent", (agent) => {
      if (agent === null) {
        total.textContent = "—";
        rate.textContent = "—";
        rate.style.color = "var(--dim)";
        spark.clear();
        lastTokens = -1;
        lastAt = 0;
        setStatus("");
        return;
      }
      const now = agent.updatedAt;
      if (lastTokens >= 0 && now > lastAt) {
        const dt = (now - lastAt) / 1000;
        const perSec = Math.max(0, (agent.totalTokens - lastTokens) / Math.max(0.25, dt));
        spark.push(perSec);
        rate.textContent = `${perSec >= 100 ? Math.round(perSec) : perSec.toFixed(1)} tok/s`;
        rate.style.color = perSec > 0 ? "var(--accent)" : "var(--dim)";
      }
      lastTokens = agent.totalTokens;
      lastAt = now;
      total.textContent = fmtTokens(agent.totalTokens);
      spark.draw(cssVar("--accent"), { floor: 40, baseline: true });
      setStatus("ok");
    });
    return undefined;
  },
};

// DIFF TAPE — agent line churn: recent edits plus running +/− totals.

import { el } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const diffTapeWidget: WidgetDef = {
  id: "diff-tape",
  label: "DIFF // TAPE",
  col: 1,
  order: 2,
  h: 128,
  mount({ store, body, setStatus }) {
    const totals = el("div");
    totals.style.display = "flex";
    totals.style.gap = "16px";
    totals.style.alignItems = "baseline";
    totals.style.marginBottom = "6px";
    const added = el("span", "", "+0");
    added.style.color = "var(--good)";
    added.style.fontSize = "20px";
    added.style.fontVariantNumeric = "tabular-nums";
    const removed = el("span", "", "−0");
    removed.style.color = "var(--bad)";
    removed.style.fontSize = "20px";
    removed.style.fontVariantNumeric = "tabular-nums";
    const files = el("span", "micro", "0 FILES");
    files.style.marginLeft = "auto";
    totals.append(added, removed, files);

    const tape = el("div", "feed");
    tape.style.fontSize = "10px";
    const wrap = el("div");
    wrap.style.height = "calc(100% - 32px)";
    wrap.style.overflow = "hidden";
    wrap.append(tape);
    body.append(totals, wrap);

    store.on("agent", (agent) => {
      if (agent === null) {
        added.textContent = "+0";
        removed.textContent = "\u22120";
        files.textContent = "0 FILES";
        tape.innerHTML = "";
        setStatus("");
        return;
      }
      added.textContent = `+${agent.linesAdded}`;
      removed.textContent = `−${agent.linesRemoved}`;
      files.textContent = `${agent.filesTouched} FILE${agent.filesTouched === 1 ? "" : "S"} · ${agent.gitBranch}`;
      setStatus(agent.linesAdded + agent.linesRemoved > 0 ? "ok" : "");
    });

    store.on("feed", (items) => {
      for (const item of items) {
        if (item.kind !== "edit") continue;
        const row = el("div", "feed-row k-edit");
        const g = el("span", "g", "±");
        const x = el("span", "x", item.text);
        row.append(g, x);
        tape.append(row);
        while (tape.childElementCount > 4) tape.firstElementChild?.remove();
      }
    });
    return undefined;
  },
};

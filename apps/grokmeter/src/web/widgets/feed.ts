// EVENT FEED — the heartbeat of the deck: a live stream of everything the
// agent does, color-coded by kind. Matrix rain with meaning.

import { el, fmtTime, toolAbbrev } from "../lib.ts";
import type { FeedItem } from "../../shared/protocol.ts";
import type { WidgetDef } from "../widget.ts";

const GLYPH: Record<FeedItem["kind"], string> = {
  turn: "──",
  phase: "·",
  tool_start: "▸",
  tool_end: "◂",
  perm_req: "⚠",
  perm_res: "✓",
  thought: "∴",
  message: "▮",
  user: "◈",
  edit: "±",
  mcp: "⌁",
  error: "✕",
};

const MAX_ROWS = 140;

export const feedWidget: WidgetDef = {
  id: "feed",
  label: "AGENT // EVENT STREAM",
  col: 1,
  order: 1,
  h: 420,
  mount({ store, body, setStatus }) {
    const feed = el("div", "feed");
    body.append(feed);
    let pinned = true;
    feed.addEventListener("scroll", () => {
      pinned = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 24;
    });

    const render = (item: FeedItem): void => {
      const row = el("div", `feed-row k-${item.kind}${item.ok === false ? " fail" : ""}`);
      if (item.kind === "turn") {
        row.textContent = `── ${item.text.toUpperCase()} ──`;
      } else {
        const t = el("span", "t", fmtTime(item.at));
        const g = el("span", "g", GLYPH[item.kind]);
        row.append(t, g);
        if (item.tool !== undefined) {
          const chip = el("span", "tool-chip", toolAbbrev(item.tool));
          row.append(chip);
        }
        const x = el("span", "x", item.text);
        row.append(x);
        if (item.ms !== undefined) {
          row.append(el("span", "ms", `${item.ms}ms`));
        }
      }
      feed.append(row);
      while (feed.childElementCount > MAX_ROWS) feed.firstElementChild?.remove();
      if (pinned) feed.scrollTop = feed.scrollHeight;
    };

    for (const item of store.feed) render(item);
    store.on("feedReset", () => {
      // Reconnect reset: the server is about to replay its ring.
      feed.innerHTML = "";
      setStatus("");
    });
    store.on("feed", (items) => {
      for (const item of items) render(item);
      const last = items[items.length - 1];
      if (last !== undefined) {
        setStatus(last.kind === "error" || last.ok === false ? "bad" : "run");
      }
    });
    return undefined;
  },
};

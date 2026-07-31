// SESSIONS // FLEET — every live grok session as a row: phase lamp, title,
// context gauge. Click a row to focus the deck's agent widgets on it.

import { el, fmtTokens } from "../lib.ts";
import type { AgentPhase } from "../../shared/protocol.ts";
import type { WidgetDef } from "../widget.ts";

const PHASE_GLYPH: Record<AgentPhase, string> = {
  idle: "·",
  waiting_for_model: "◌",
  streaming_reasoning: "◍",
  streaming_text: "◉",
  tool_execution: "▸",
  permission_prompt: "⚠",
};

const PHASE_COLOR: Record<AgentPhase, string> = {
  idle: "var(--dim)",
  waiting_for_model: "var(--dim)",
  streaming_reasoning: "var(--accent-2)",
  streaming_text: "var(--accent)",
  tool_execution: "var(--good)",
  permission_prompt: "var(--warn)",
};

export const fleetWidget: WidgetDef = {
  id: "fleet",
  label: "SESSIONS // FLEET",
  col: 3,
  order: 0,
  h: 148,
  mount({ store, body, setStatus }) {
    const list = el("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "3px";
    list.style.height = "100%";
    list.style.overflowY = "auto";
    body.append(list);

    store.on("fleet", (fleet) => {
      list.innerHTML = "";
      if (fleet.length === 0) {
        const none = el("div", "micro", "NO SESSIONS");
        list.append(none);
        setStatus("");
        return;
      }
      for (const s of fleet) {
        const row = el("div", "fleet-row");
        if (s.focused) row.classList.add("focused");

        const lamp = el("span", "g", PHASE_GLYPH[s.phase]);
        lamp.style.color = PHASE_COLOR[s.phase];
        lamp.style.width = "12px";
        lamp.style.flex = "none";
        if (s.phase === "permission_prompt") lamp.style.animation = "pulse 0.7s ease-in-out infinite";

        const name = el("span", "", s.title === "" ? s.id.slice(0, 13) : s.title);
        name.style.overflow = "hidden";
        name.style.textOverflow = "ellipsis";
        name.style.whiteSpace = "nowrap";
        name.style.flex = "1";

        const where = el("span", "micro", s.cwd.split("/").pop() ?? s.cwd);
        where.style.flex = "none";
        where.style.maxWidth = "72px";
        where.style.overflow = "hidden";
        where.style.textOverflow = "ellipsis";

        const ctx = el(
          "span",
          "micro",
          s.contextWindowTokens > 0
            ? `${Math.round((s.contextUsedTokens / s.contextWindowTokens) * 100)}%`
            : fmtTokens(s.contextUsedTokens),
        );
        ctx.style.flex = "none";
        ctx.style.color = "var(--ink)";

        if (!s.live) {
          const dormant = el("span", "micro", "DISK");
          dormant.style.flex = "none";
          row.append(lamp, name, where, dormant, ctx);
        } else {
          row.append(lamp, name, where, ctx);
        }

        row.addEventListener("click", () => {
          if (!s.focused) store.requestFocus(s.id);
        });
        list.append(row);
      }
      const pending = fleet.some((s) => s.permPending);
      setStatus(pending ? "warn" : fleet.some((s) => s.live) ? "ok" : "");
    });
    return undefined;
  },
};

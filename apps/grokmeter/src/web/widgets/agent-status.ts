// AGENT STATUS — the big phase readout: what the agent is doing right now.

import { el, fmtClock } from "../lib.ts";
import type { AgentPhase } from "../../shared/protocol.ts";
import type { WidgetDef, WidgetStatus } from "../widget.ts";

const PHASE_TEXT: Record<AgentPhase, string> = {
  idle: "IDLE",
  waiting_for_model: "AWAITING MODEL",
  streaming_reasoning: "REASONING",
  streaming_text: "RESPONDING",
  tool_execution: "EXECUTING TOOL",
  permission_prompt: "PERMISSION HOLD",
};

const PHASE_COLOR: Record<AgentPhase, string> = {
  idle: "var(--dim)",
  waiting_for_model: "var(--dim)",
  streaming_reasoning: "var(--accent-2)",
  streaming_text: "var(--accent)",
  tool_execution: "var(--good)",
  permission_prompt: "var(--warn)",
};

const PHASE_STATUS: Record<AgentPhase, WidgetStatus> = {
  idle: "",
  waiting_for_model: "run",
  streaming_reasoning: "run",
  streaming_text: "run",
  tool_execution: "ok",
  permission_prompt: "warn",
};

export const agentStatusWidget: WidgetDef = {
  id: "agent-status",
  label: "AGENT // STATUS",
  col: 1,
  order: 0,
  h: 124,
  mount({ store, body, setStatus }) {
    const phase = el("div", "display-num", "NO SIGNAL");
    phase.style.fontSize = "26px";
    phase.style.letterSpacing = "0.06em";
    phase.style.fontWeight = "300";
    phase.style.color = "var(--dim)";

    const sub = el("div", "micro", "waiting for a session …");
    sub.style.marginTop = "6px";

    const row = el("div");
    row.style.display = "flex";
    row.style.gap = "18px";
    row.style.marginTop = "12px";
    const mkStat = (label: string): HTMLElement => {
      const cell = el("div");
      const l = el("span", "micro", label);
      l.style.display = "block";
      const v = el("span", "", "—");
      v.style.fontSize = "13px";
      v.style.fontVariantNumeric = "tabular-nums";
      cell.append(l, v);
      row.append(cell);
      return v;
    };
    const turn = mkStat("TURN");
    const tools = mkStat("TOOLS");
    const model = mkStat("MODEL");
    const elapsed = mkStat("ELAPSED");

    body.append(phase, sub, row);

    let phaseSince = Date.now();
    let lastPhase: AgentPhase | null = null;
    let lastSessionId = "";

    store.on("agent", (agent) => {
      if (agent === null) {
        phase.textContent = "NO SIGNAL";
        phase.style.color = "var(--dim)";
        phase.style.textShadow = "none";
        sub.textContent = "waiting for a session …";
        turn.textContent = "—";
        tools.textContent = "—";
        model.textContent = "—";
        elapsed.textContent = "—";
        lastPhase = null;
        lastSessionId = "";
        setStatus("");
        return;
      }
      if (agent.id !== lastSessionId) {
        // New session: the phase-hold timer must not inherit the old one.
        lastSessionId = agent.id;
        lastPhase = null;
      }
      if (agent.phase !== lastPhase) {
        lastPhase = agent.phase;
        phaseSince = Date.now();
      }
      phase.textContent = PHASE_TEXT[agent.phase];
      phase.style.color = PHASE_COLOR[agent.phase];
      phase.style.textShadow = agent.phase === "idle" ? "none" : "0 0 16px currentColor";
      const held = fmtClock((Date.now() - phaseSince) / 1000);
      sub.textContent = `${agent.agentName} · ${agent.title} · in phase ${held}`;
      turn.textContent = agent.turnCount.toString();
      tools.textContent = agent.toolCallCount.toString();
      model.textContent = agent.model;
      elapsed.textContent = fmtClock(agent.durationSec);
      setStatus(PHASE_STATUS[agent.phase]);
    });
    return undefined;
  },
};

// TOOL RADAR — polar plot of per-tool call volume with a rotating sweep.
// New calls ping at their spoke. Honest data, decorative motion.

import { cssVar, el, toolAbbrev } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

type Ping = { angle: number; at: number };

export const toolRadarWidget: WidgetDef = {
  id: "tool-radar",
  label: "TOOLS // RADAR",
  col: 2,
  order: 1,
  h: 248,
  mount({ store, body, setStatus }) {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    body.append(canvas);

    const readout = el("div", "micro", "");
    readout.style.position = "absolute";
    readout.style.left = "10px";
    readout.style.bottom = "8px";
    body.append(readout);

    let tools: Record<string, { count: number; failures: number }> = {};
    const prevCounts = new Map<string, number>();
    const pings: Ping[] = [];
    let sessionId = "";

    const spokeAngle = (idx: number, n: number): number => (idx / n) * Math.PI * 2 - Math.PI / 2;

    store.on("agent", (agent) => {
      if (agent === null) {
        tools = {};
        prevCounts.clear();
        pings.length = 0;
        sessionId = "";
        setStatus("");
        return;
      }
      if (agent.id !== sessionId) {
        // New session: drop the old baselines or pings stay dark until the
        // new counts overtake the previous session's peaks.
        sessionId = agent.id;
        prevCounts.clear();
        pings.length = 0;
      }
      tools = agent.tools;
      const names = Object.keys(tools).sort((a, b) => (tools[b]?.count ?? 0) - (tools[a]?.count ?? 0)).slice(0, 8);
      names.forEach((name, i) => {
        const cur = tools[name]?.count ?? 0;
        const prev = prevCounts.get(name) ?? 0;
        if (cur > prev) pings.push({ angle: spokeAngle(i, names.length), at: performance.now() });
        prevCounts.set(name, cur);
      });
      readout.textContent = `${agent.toolCallCount} CALLS · ${agent.toolFailureCount} FAIL`;
      setStatus(agent.toolFailureCount > 0 ? "warn" : "ok");
    });

    const tick = (now: number): void => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext("2d");
      if (ctx === null) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2 - 4;
      const R = Math.min(w, h) / 2 - 22;
      const accent = cssVar("--accent");
      const dim = cssVar("--dim");

      // Rings.
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.14;
      ctx.setLineDash([2, 5]);
      for (const rr of [R, R * 0.66, R * 0.33]) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Sweep wedge with fading trail.
      const sweepA = ((now / 1000) * 0.9) % (Math.PI * 2);
      for (let i = 0; i < 26; i += 1) {
        const a = sweepA - i * 0.028;
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.10 * (1 - i / 26);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Spokes.
      const names = Object.keys(tools).sort((a, b) => (tools[b]?.count ?? 0) - (tools[a]?.count ?? 0)).slice(0, 8);
      const max = Math.max(1, ...names.map((n) => tools[n]?.count ?? 0));
      names.forEach((name, i) => {
        const stat = tools[name];
        if (stat === undefined) return;
        const a = spokeAngle(i, names.length);
        const len = (Math.sqrt(stat.count) / Math.sqrt(max)) * (R - 14) + 6;
        const x = cx + Math.cos(a) * len;
        const y = cy + Math.sin(a) * len;

        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = stat.failures > 0 ? cssVar("--warn") : accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const lx = cx + Math.cos(a) * (R + 11);
        const ly = cy + Math.sin(a) * (R + 11);
        ctx.fillStyle = dim;
        ctx.font = "7.5px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${toolAbbrev(name)} ${stat.count}`, lx, ly);
      });

      // Pings: expanding fading circles.
      const nowMs = performance.now();
      for (let i = pings.length - 1; i >= 0; i -= 1) {
        const ping = pings[i];
        if (ping === undefined) continue;
        const age = (nowMs - ping.at) / 900;
        if (age > 1) {
          pings.splice(i, 1);
          continue;
        }
        const pr = 4 + age * 26;
        const px = cx + Math.cos(ping.angle) * (R * 0.55);
        const py = cy + Math.sin(ping.angle) * (R * 0.55);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.5 * (1 - age);
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Center reticle.
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy + 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    return { tick };
  },
};

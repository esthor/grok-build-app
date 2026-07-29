// MISSION — session identity: what is being built, where, on which branch.

import { el } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

export const missionWidget: WidgetDef = {
  id: "mission",
  label: "MISSION // SESSION",
  col: 3,
  order: 0,
  h: 148,
  mount({ store, body, setStatus }) {
    const title = el("div", "", "NO ACTIVE MISSION");
    title.style.fontSize = "13px";
    title.style.lineHeight = "1.35";
    title.style.color = "var(--accent)";
    title.style.textShadow = "0 0 10px var(--glow)";
    title.style.marginBottom = "7px";
    title.style.overflow = "hidden";
    title.style.display = "-webkit-box";
    title.style.webkitLineClamp = "2";
    title.style.webkitBoxOrient = "vertical";

    const mkRow = (key: string): HTMLElement => {
      const kv = el("div", "kv");
      const k = el("span", "k", key);
      const v = el("span", "v", "—");
      v.style.overflow = "hidden";
      v.style.textOverflow = "ellipsis";
      v.style.whiteSpace = "nowrap";
      v.style.maxWidth = "200px";
      kv.append(k, v);
      body.append(kv);
      return v;
    };

    body.append(title);
    const cwd = mkRow("CWD");
    const git = mkRow("GIT");
    const model = mkRow("MODEL");
    const sandbox = mkRow("SANDBOX");
    const session = mkRow("SESSION");

    store.on("agent", (agent) => {
      if (agent === null) {
        title.textContent = "NO ACTIVE MISSION";
        setStatus("");
        return;
      }
      title.textContent = agent.title.toUpperCase();
      cwd.textContent = agent.cwd.replace(/^\/Users\/[^/]+/, "~");
      git.textContent = `${agent.gitBranch} @ ${agent.gitCommit.slice(0, 7)}`;
      model.textContent = `${agent.model} · ${agent.reasoningEffort.toUpperCase()}`;
      sandbox.textContent = agent.sandbox;
      session.textContent = agent.id.slice(0, 13);
      setStatus(agent.live ? "ok" : "");
    });
    return undefined;
  },
};

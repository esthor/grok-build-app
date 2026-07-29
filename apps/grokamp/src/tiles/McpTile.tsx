import { useStore } from "@tanstack/react-store";
import type { ReactNode } from "react";
import { sessionStore } from "../state/session";
import { Led, LcdText } from "../ui/controls";

export function McpTile(): ReactNode {
  const servers = useStore(sessionStore, (s) => s.mcp);

  return (
    <div className="mcp-tile lcd">
      {servers.map((server) => (
        <div className="mcp-row" key={server.name}>
          <Led
            on={server.status !== "down"}
            color={server.status === "online" ? "var(--sk-ok)" : "var(--sk-warn)"}
          />
          <span className="mcp-name">{server.name}</span>
          <span className="mcp-meta">
            <LcdText dim>
              {server.status === "down" ? "DOWN" : `${server.toolCount} tools`}
            </LcdText>
          </span>
        </div>
      ))}
      <div className="mcp-footer">
        <LcdText dim>plugins never die — they just get namespaced</LcdText>
      </div>
    </div>
  );
}

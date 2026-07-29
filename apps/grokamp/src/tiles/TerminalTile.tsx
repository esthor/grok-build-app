import { useStore } from "@tanstack/react-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { respondPermission } from "../agent/controller";
import { sessionStore, type LogLine } from "../state/session";
import { LcdText, SquareBtn } from "../ui/controls";

const KIND_PREFIX: Record<LogLine["kind"], string> = {
  sys: "::",
  think: " ⋯",
  say: " >",
  tool: "",
  result: "  ",
  perm: "",
};

export function TerminalTile(): ReactNode {
  const log = useStore(sessionStore, (s) => s.log);
  const pendingPerms = useStore(sessionStore, (s) => s.pendingPerms);
  const status = useStore(sessionStore, (s) => s.status);
  const usage = useStore(sessionStore, (s) => s.usage);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  const virtualizer = useVirtualizer({
    count: log.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 16,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (pinned && el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log, pinned, pendingPerms.length]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    setPinned(el.scrollTop + el.clientHeight >= el.scrollHeight - 32);
  };

  return (
    <div className="terminal-tile">
      <div className="term-scroll lcd" ref={scrollRef} onScroll={onScroll}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const line = log[row.index];
            if (line === undefined) {
              return null;
            }
            return (
              <div
                key={line.id}
                ref={virtualizer.measureElement}
                data-index={row.index}
                className="term-line"
                data-kind={line.kind}
                data-tone={line.tone}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <span className="term-prefix">{KIND_PREFIX[line.kind]}</span>
                {line.text}
              </div>
            );
          })}
        </div>
      </div>

      {pendingPerms.map((perm) => (
        <div className="perm-card" key={perm.requestId}>
          <div className="perm-card-head">
            <LcdText accent>⚿ APPROVAL NEEDED</LcdText>
            <span className="perm-risk" data-risk={perm.risk}>
              {perm.risk === 2 ? "SPICY" : "MUTATING"}
            </span>
          </div>
          <div className="perm-card-label">{perm.label}</div>
          <div className="perm-card-actions">
            <SquareBtn
              title="allow this tool call"
              onClick={() => {
                respondPermission(perm.requestId, "allow");
              }}
            >
              ALLOW
            </SquareBtn>
            <SquareBtn
              title="deny this tool call"
              onClick={() => {
                respondPermission(perm.requestId, "deny");
              }}
            >
              DENY
            </SquareBtn>
            <span className="perm-hint">
              <LcdText dim>tip: RISK slider changes what auto-allows</LcdText>
            </span>
          </div>
        </div>
      ))}

      <div className="term-statusline">
        <LcdText dim>
          {status.toUpperCase()} · IN {(usage.inputTokens / 1000).toFixed(1)}K · OUT{" "}
          {(usage.outputTokens / 1000).toFixed(1)}K
        </LcdText>
        {!pinned && (
          <button
            type="button"
            className="term-followbtn"
            onClick={() => {
              setPinned(true);
              const el = scrollRef.current;
              if (el !== null) {
                el.scrollTop = el.scrollHeight;
              }
            }}
          >
            ▼ FOLLOW
          </button>
        )}
      </div>
    </div>
  );
}

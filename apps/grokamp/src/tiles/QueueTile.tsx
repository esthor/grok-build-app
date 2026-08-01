import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { jumpTo } from "../agent/controller";
import type { TaskSpec } from "../agent/protocol";
import { DEMO_TASKS } from "../agent/tasks";
import {
  isConsumed,
  queueStore,
  removeTasks,
  restoreDemoQueue,
  statusOf,
  type TaskStatus,
} from "../state/queue";
import { LcdText, SquareBtn } from "../ui/controls";
import { TaskComposer } from "./TaskComposer";

/** pretend media-library scan; gives the playlist its dramatic entrance */
async function scanLibrary(): Promise<readonly TaskSpec[]> {
  await new Promise((resolve) => {
    setTimeout(resolve, 700);
  });
  return DEMO_TASKS;
}

const STATUS_GLYPH: Readonly<Record<TaskStatus, string>> = {
  queued: "",
  running: "▶ ",
  done: "✓ ",
  stopped: "■ ",
  failed: "✗ ",
};

export function QueueTile(): ReactNode {
  const queue = useStore(queueStore);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [composing, setComposing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const library = useQuery({ queryKey: ["task-library"], queryFn: scanLibrary });

  useEffect(() => {
    if (library.isSuccess && queueStore.state.items.length === 0) {
      restoreDemoQueue();
      const first = queueStore.state.items[0];
      if (first !== undefined) {
        jumpTo(first.id, false);
      }
    }
  }, [library.isSuccess]);

  const virtualizer = useVirtualizer({
    count: queue.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
    overscan: 12,
  });

  const runnableCount = queue.items.filter((t) => !isConsumed(queue, t.id)).length;
  const totalTokens = queue.items.reduce((sum, t) => sum + t.estOutputTokens, 0);

  const onRowClick = (id: string, e: ReactMouseEvent): void => {
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    } else {
      setSelected([id]);
    }
  };

  return (
    <div className="queue-tile">
      <div className="queue-list lcd" ref={scrollRef}>
        {library.isPending && queue.items.length === 0 ? (
          <div className="queue-empty">
            <LcdText accent>SCANNING TASK LIBRARY…</LcdText>
          </div>
        ) : queue.items.length === 0 ? (
          <div className="queue-empty">
            <LcdText dim>queue empty — ADD a task or MISC for the demo set</LcdText>
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const task = queue.items[row.index];
              if (task === undefined) {
                return null;
              }
              const state = statusOf(queue, task.id);
              const consumed = state !== "queued";
              const isCurrent = task.id === queue.currentId;
              return (
                <div
                  key={task.id}
                  className="queue-row"
                  data-current={isCurrent ? "yes" : "no"}
                  data-selected={selected.includes(task.id) ? "yes" : "no"}
                  data-status={state}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: row.size,
                    transform: `translateY(${row.start}px)`,
                  }}
                  onClick={(e) => {
                    onRowClick(task.id, e);
                  }}
                  onDoubleClick={() => {
                    jumpTo(task.id, true);
                  }}
                  title={
                    consumed
                      ? `${task.title} — already ${state}; sessions run once`
                      : `${task.title} [${task.repo}] — double-click to run`
                  }
                >
                  <span className="queue-row-title">
                    {STATUS_GLYPH[state]}
                    {row.index + 1}. {task.title}
                  </span>
                  <span className="queue-row-len">
                    {(task.estOutputTokens / 1000).toFixed(1)}k
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="queue-footer">
        <div className="queue-btns">
          <SquareBtn
            title="compose a task (repo + prompt + /commands)"
            onClick={() => {
              setComposing(true);
            }}
          >
            ADD
          </SquareBtn>
          <SquareBtn
            title="remove selected"
            onClick={() => {
              removeTasks(selected);
              setSelected([]);
            }}
          >
            REM
          </SquareBtn>
          <SquareBtn
            title="select all / none"
            onClick={() => {
              setSelected((prev) =>
                prev.length === queue.items.length ? [] : queue.items.map((t) => t.id),
              );
            }}
          >
            SEL
          </SquareBtn>
          <SquareBtn title="restore the demo queue" onClick={restoreDemoQueue}>
            MISC
          </SquareBtn>
        </div>
        <span className="queue-total">
          <LcdText dim>
            {runnableCount}/{queue.items.length} READY · {(totalTokens / 1000).toFixed(0)}K EST
          </LcdText>
        </span>
      </div>
      {composing && (
        <TaskComposer
          onClose={() => {
            setComposing(false);
          }}
        />
      )}
    </div>
  );
}

import { Store } from "@tanstack/store";
import type { TaskSpec } from "../agent/protocol";
import { DEMO_TASKS } from "../agent/tasks";

/**
 * A session is a session: once a task has been started it is *consumed* and
 * can never be re-run. That matches the harness — you don't replay a session,
 * you queue a new one — and it keeps the queue an honest audit trail.
 */
export type TaskStatus = "queued" | "running" | "done" | "stopped" | "failed";

export interface QueueState {
  readonly items: readonly TaskSpec[];
  readonly status: Readonly<Record<string, TaskStatus>>;
  readonly currentId: string | null;
  readonly shuffle: boolean;
  readonly repeat: boolean;
}

/** starts empty; the Queue tile "scans the library" (react-query) to fill it */
export const queueStore = new Store<QueueState>({
  items: [],
  status: {},
  currentId: null,
  shuffle: false,
  repeat: false,
});

export function statusOf(state: QueueState, id: string): TaskStatus {
  return state.status[id] ?? "queued";
}

/** consumed = started at least once, so it may never run again */
export function isConsumed(state: QueueState, id: string): boolean {
  return statusOf(state, id) !== "queued";
}

export function isRunnable(state: QueueState, id: string): boolean {
  return !isConsumed(state, id);
}

export function setTaskStatus(id: string, status: TaskStatus): void {
  queueStore.setState((s) => ({ ...s, status: { ...s.status, [id]: status } }));
}

export function currentTask(state: QueueState): TaskSpec | null {
  return state.items.find((t) => t.id === state.currentId) ?? null;
}

export function currentIndex(state: QueueState): number {
  return state.items.findIndex((t) => t.id === state.currentId);
}

/** the next *runnable* task in a direction, or null when there is none left */
export function nextTaskId(state: QueueState, direction: 1 | -1): string | null {
  const runnable = state.items.filter((t) => isRunnable(state, t.id));
  if (runnable.length === 0) {
    return null;
  }
  if (state.shuffle) {
    const others = runnable.filter((t) => t.id !== state.currentId);
    const pool = others.length > 0 ? others : runnable;
    return pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
  }
  const index = currentIndex(state);
  // walk the full list so consumed tasks are skipped, not stumbled over
  for (let step = 1; step <= state.items.length; step++) {
    let probe = index + direction * step;
    if (probe < 0 || probe >= state.items.length) {
      if (!state.repeat) {
        continue;
      }
      probe = ((probe % state.items.length) + state.items.length) % state.items.length;
    }
    const candidate = state.items[probe];
    if (candidate !== undefined && isRunnable(state, candidate.id)) {
      return candidate.id;
    }
  }
  return null;
}

export function setCurrent(id: string | null): void {
  queueStore.setState((s) => ({ ...s, currentId: id }));
}

export function toggleShuffle(): void {
  queueStore.setState((s) => ({ ...s, shuffle: !s.shuffle }));
}

export function toggleRepeat(): void {
  queueStore.setState((s) => ({ ...s, repeat: !s.repeat }));
}

export function addTask(task: TaskSpec): void {
  queueStore.setState((s) => ({
    ...s,
    items: [...s.items, task],
    currentId: s.currentId ?? task.id,
  }));
}

export function removeTasks(ids: readonly string[]): void {
  queueStore.setState((s) => {
    const items = s.items.filter((t) => !ids.includes(t.id));
    const status = { ...s.status };
    for (const id of ids) {
      delete status[id];
    }
    const currentId = items.some((t) => t.id === s.currentId)
      ? s.currentId
      : (items.find((t) => !isConsumed(s, t.id))?.id ?? items[0]?.id ?? null);
    return { ...s, items, status, currentId };
  });
}

export function clearQueue(): void {
  queueStore.setState((s) => ({ ...s, items: [], status: {}, currentId: null }));
}

export function restoreDemoQueue(): void {
  queueStore.setState((s) => ({
    ...s,
    items: DEMO_TASKS,
    status: {},
    currentId: DEMO_TASKS[0]?.id ?? null,
  }));
}

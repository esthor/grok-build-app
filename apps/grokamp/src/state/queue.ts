import { Store } from "@tanstack/store";
import type { TaskSpec } from "../agent/protocol";
import { DEMO_TASKS } from "../agent/tasks";

export interface QueueState {
  readonly items: readonly TaskSpec[];
  readonly currentId: string | null;
  readonly shuffle: boolean;
  readonly repeat: boolean;
}

/** starts empty; the Queue tile "scans the library" (react-query) to fill it */
export const queueStore = new Store<QueueState>({
  items: [],
  currentId: null,
  shuffle: false,
  repeat: false,
});

export function currentTask(state: QueueState): TaskSpec | null {
  return state.items.find((t) => t.id === state.currentId) ?? null;
}

export function currentIndex(state: QueueState): number {
  return state.items.findIndex((t) => t.id === state.currentId);
}

/** returns the task that should play after the current one, or null = end */
export function nextTaskId(state: QueueState, direction: 1 | -1): string | null {
  if (state.items.length === 0) {
    return null;
  }
  if (state.shuffle && state.items.length > 1) {
    const others = state.items.filter((t) => t.id !== state.currentId);
    const pickIndex = Math.floor(Math.random() * others.length);
    return others[pickIndex]?.id ?? null;
  }
  const index = currentIndex(state);
  const next = index + direction;
  if (next < 0) {
    return state.repeat ? (state.items[state.items.length - 1]?.id ?? null) : null;
  }
  if (next >= state.items.length) {
    return state.repeat ? (state.items[0]?.id ?? null) : null;
  }
  return state.items[next]?.id ?? null;
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
  queueStore.setState((s) => ({ ...s, items: [...s.items, task] }));
}

export function removeTasks(ids: readonly string[]): void {
  queueStore.setState((s) => {
    const items = s.items.filter((t) => !ids.includes(t.id));
    const currentId = items.some((t) => t.id === s.currentId)
      ? s.currentId
      : (items[0]?.id ?? null);
    return { ...s, items, currentId };
  });
}

export function clearQueue(): void {
  queueStore.setState((s) => ({ ...s, items: [], currentId: null }));
}

export function restoreDemoQueue(): void {
  queueStore.setState((s) => ({
    ...s,
    items: DEMO_TASKS,
    currentId: DEMO_TASKS[0]?.id ?? null,
  }));
}

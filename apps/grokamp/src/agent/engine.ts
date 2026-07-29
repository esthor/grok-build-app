import { VisAnalyser } from "./analyser";
import type {
  AgentEvent,
  AgentTransport,
  PermissionDecision,
  RiskLevel,
  TaskSpec,
  TodoItem,
  TokenUsage,
  ToolKind,
  TransportStatus,
} from "./protocol";
import { irange, mulberry32, pick } from "./rng";
import { TEXT_SNIPPETS, THINK_SNIPPETS, TOOL_TEMPLATES } from "./tasks";

export const TICK_MS = 100;

type Beat =
  | { readonly type: "todo_start"; readonly index: number }
  | { readonly type: "todo_done"; readonly index: number }
  | { readonly type: "think"; readonly tokens: number }
  | { readonly type: "say"; readonly tokens: number }
  | {
      readonly type: "tool";
      readonly tool: ToolKind;
      readonly label: string;
      readonly ok: string;
      readonly risk: RiskLevel;
      readonly ticks: number;
    };

interface ActiveTool {
  readonly callId: string;
  readonly beat: Extract<Beat, { type: "tool" }>;
  ticksLeft: number;
}

interface PendingPermission {
  readonly requestId: string;
  readonly beat: Extract<Beat, { type: "tool" }>;
}

function buildScript(task: TaskSpec, rand: () => number): Beat[] {
  const beats: Beat[] = [{ type: "think", tokens: irange(rand, 60, 140) }];
  task.plan.forEach((_step, index) => {
    beats.push({ type: "todo_start", index });
    beats.push({ type: "think", tokens: irange(rand, 40, 120) });
    const tools = irange(rand, 1, 3);
    for (let i = 0; i < tools; i++) {
      const t = pick(rand, TOOL_TEMPLATES);
      beats.push({
        type: "tool",
        tool: t.tool,
        label: t.label,
        ok: t.ok,
        risk: t.risk,
        ticks: irange(rand, 6, 26),
      });
    }
    beats.push({ type: "say", tokens: irange(rand, 50, 130) });
    beats.push({ type: "todo_done", index });
  });
  beats.push({ type: "say", tokens: irange(rand, 80, 160) });
  return beats;
}

/**
 * A fake grok-build: walks a seeded script of think/tool/say beats on a
 * 100ms tick, streams deltas, raises permission prompts (which genuinely
 * block the run, like a real harness), and feeds the analyser.
 */
export class SimTransport implements AgentTransport {
  readonly analyser = new VisAnalyser();

  private listeners = new Set<(event: AgentEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private rand: () => number = mulberry32(1);

  private task: TaskSpec | null = null;
  private script: Beat[] = [];
  private beatIndex = 0;
  private beatTokensLeft = 0;
  private snippet = "";
  private snippetPos = 0;

  private activeTool: ActiveTool | null = null;
  private pendingPermission: PendingPermission | null = null;
  private todos: TodoItem[] = [];

  private throttle = 0.65;
  private risk = 0;
  private effort = 0.6;

  private outputTokens = 0;
  private inputTokens = 0;
  private contextUsed = 0;
  private usagePulse = 0;
  private idCounter = 0;

  private statusValue: TransportStatus = "idle";

  get status(): TransportStatus {
    return this.statusValue;
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  load(task: TaskSpec): void {
    this.stopTimer();
    this.task = task;
    this.rand = mulberry32(hashString(task.id));
    this.script = buildScript(task, this.rand);
    this.beatIndex = 0;
    this.beatTokensLeft = 0;
    this.snippet = "";
    this.snippetPos = 0;
    this.activeTool = null;
    this.pendingPermission = null;
    this.outputTokens = 0;
    this.inputTokens = irange(this.rand, 12_000, 38_000);
    this.contextUsed = this.inputTokens;
    this.idCounter = 0;
    this.analyser.reset();
    this.todos = task.plan.map((text, i) => ({
      id: `${task.id}-todo-${i}`,
      text,
      status: "pending",
    }));
    this.statusValue = "idle";
  }

  play(): void {
    if (this.task === null || this.timer !== null) {
      return;
    }
    if (this.statusValue === "done") {
      this.load(this.task);
    }
    const starting = this.statusValue === "idle";
    this.statusValue = this.pendingPermission !== null ? "blocked" : "running";
    if (starting) {
      this.emit({ kind: "session_started", task: this.task });
      this.emit({ kind: "todos_updated", todos: [...this.todos] });
      this.emitUsage();
    }
    this.timer = setInterval(() => {
      this.tick();
    }, TICK_MS);
  }

  pause(): void {
    if (this.timer === null) {
      return;
    }
    this.stopTimer();
    if (this.statusValue === "running" || this.statusValue === "blocked") {
      this.statusValue = "paused";
    }
  }

  stop(): void {
    const wasActive = this.statusValue !== "idle" && this.statusValue !== "done";
    this.stopTimer();
    this.analyser.reset();
    if (wasActive) {
      this.statusValue = "idle";
      this.emit({
        kind: "session_finished",
        result: "aborted",
        summary: "stopped by operator",
      });
    }
    if (this.task !== null) {
      this.load(this.task);
    }
  }

  respondPermission(requestId: string, decision: PermissionDecision): void {
    const pending = this.pendingPermission;
    if (pending === null || pending.requestId !== requestId) {
      return;
    }
    this.pendingPermission = null;
    this.emit({
      kind: "permission_resolved",
      requestId,
      decision,
      auto: false,
    });
    if (decision === "allow") {
      this.startTool(pending.beat);
    } else {
      this.emit({
        kind: "tool_call_finished",
        callId: this.nextId("call"),
        ok: false,
        summary: "denied by operator",
      });
      this.analyser.pushEnergy(0.9, 0.5);
      this.beatIndex += 1;
    }
    if (this.timer !== null) {
      this.statusValue = "running";
    }
  }

  setThrottle(value: number): void {
    this.throttle = clamp01(value);
  }

  setRisk(value: number): void {
    this.risk = Math.max(-1, Math.min(1, value));
  }

  setEffort(value: number): void {
    this.effort = clamp01(value);
  }

  progress(): number {
    if (this.task === null || this.task.estOutputTokens === 0) {
      return 0;
    }
    return Math.min(1, this.outputTokens / this.task.estOutputTokens);
  }

  private tick(): void {
    this.analyser.tick(TICK_MS);
    if (this.statusValue === "blocked") {
      // parked on a permission prompt: nervous high-end flicker
      if (this.rand() < 0.3) {
        this.analyser.pushEnergy(0.95, 0.25);
      }
      return;
    }
    if (this.task === null) {
      return;
    }

    if (this.activeTool !== null) {
      this.activeTool.ticksLeft -= 1;
      this.analyser.pushEnergy(0.15 + this.rand() * 0.2, 0.18);
      this.contextUsed += irange(this.rand, 8, 40);
      if (this.activeTool.ticksLeft <= 0) {
        const failed = this.rand() < 0.06;
        this.emit({
          kind: "tool_call_finished",
          callId: this.activeTool.callId,
          ok: !failed,
          summary: failed ? "exit 1 — retrying next step" : this.activeTool.beat.ok,
        });
        this.analyser.pushEnergy(failed ? 0.85 : 0.7, 0.55);
        this.activeTool = null;
        this.beatIndex += 1;
      }
      this.pulseUsage();
      return;
    }

    const beat = this.script[this.beatIndex];
    if (beat === undefined) {
      this.finish();
      return;
    }

    switch (beat.type) {
      case "todo_start":
        this.setTodoStatus(beat.index, "in_progress");
        this.beatIndex += 1;
        break;
      case "todo_done":
        this.setTodoStatus(beat.index, "completed");
        this.analyser.pushEnergy(0.5, 0.4);
        this.beatIndex += 1;
        break;
      case "tool": {
        const auto = autoAllows(this.risk, beat.risk);
        if (beat.risk > 0 && !auto) {
          const requestId = this.nextId("perm");
          this.pendingPermission = { requestId, beat };
          this.statusValue = "blocked";
          this.emit({
            kind: "permission_requested",
            requestId,
            tool: beat.tool,
            label: beat.label,
            risk: beat.risk,
            blocking: true,
          });
          this.analyser.pushEnergy(1, 0.9);
          return;
        }
        if (beat.risk > 0) {
          const requestId = this.nextId("perm");
          this.emit({
            kind: "permission_requested",
            requestId,
            tool: beat.tool,
            label: beat.label,
            risk: beat.risk,
            blocking: false,
          });
          this.emit({
            kind: "permission_resolved",
            requestId,
            decision: "allow",
            auto: true,
          });
        }
        this.startTool(beat);
        break;
      }
      case "think":
      case "say": {
        if (this.beatTokensLeft === 0) {
          this.beatTokensLeft = Math.max(
            8,
            Math.round(beat.tokens * (0.5 + this.effort)),
          );
          this.snippet = pick(
            this.rand,
            beat.type === "think" ? THINK_SNIPPETS : TEXT_SNIPPETS,
          );
          this.snippetPos = 0;
        }
        const rate = 2 + this.throttle * 12 * (0.6 + this.effort * 0.8);
        const emitted = Math.min(
          this.beatTokensLeft,
          Math.max(1, Math.round(rate * (0.7 + this.rand() * 0.6))),
        );
        this.beatTokensLeft -= emitted;
        this.outputTokens += emitted;
        this.contextUsed += emitted;
        this.analyser.recordTokens(emitted);
        this.analyser.pushEnergy(
          beat.type === "think" ? 0.35 : 0.55,
          Math.min(0.5, emitted / 18),
        );
        const chars = this.takeChars(emitted * 4);
        if (chars.length > 0) {
          this.emit(
            beat.type === "think"
              ? { kind: "thinking_delta", text: chars }
              : { kind: "text_delta", text: chars },
          );
        }
        if (this.beatTokensLeft === 0) {
          this.beatIndex += 1;
        }
        this.pulseUsage();
        break;
      }
    }
  }

  private startTool(beat: Extract<Beat, { type: "tool" }>): void {
    const callId = this.nextId("call");
    this.activeTool = { callId, beat, ticksLeft: beat.ticks };
    this.emit({
      kind: "tool_call_started",
      callId,
      tool: beat.tool,
      label: beat.label,
    });
    this.analyser.pushEnergy(0.05, 1);
  }

  private takeChars(count: number): string {
    let out = "";
    let remaining = count;
    while (remaining > 0) {
      if (this.snippetPos >= this.snippet.length) {
        this.snippet = pick(this.rand, this.rand() < 0.5 ? THINK_SNIPPETS : TEXT_SNIPPETS);
        this.snippetPos = 0;
      }
      const slice = this.snippet.slice(this.snippetPos, this.snippetPos + remaining);
      out += slice;
      this.snippetPos += slice.length;
      remaining -= slice.length;
    }
    return out;
  }

  private setTodoStatus(index: number, status: TodoItem["status"]): void {
    this.todos = this.todos.map((todo, i) => (i === index ? { ...todo, status } : todo));
    this.emit({ kind: "todos_updated", todos: [...this.todos] });
  }

  private pulseUsage(): void {
    this.usagePulse += 1;
    if (this.usagePulse >= 5) {
      this.usagePulse = 0;
      this.emitUsage();
    }
  }

  private emitUsage(): void {
    this.emit({ kind: "usage_updated", usage: this.usage() });
  }

  private usage(): TokenUsage {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      contextUsed: this.contextUsed,
      contextLimit: 256_000,
      costUsd: (this.inputTokens * 3 + this.outputTokens * 15) / 1_000_000,
    };
  }

  private finish(): void {
    this.stopTimer();
    this.statusValue = "done";
    this.emitUsage();
    this.emit({
      kind: "session_finished",
      result: "success",
      summary: `done — ${this.outputTokens.toLocaleString()} tokens out`,
    });
    this.analyser.pushEnergy(0.3, 1);
    this.analyser.pushEnergy(0.6, 0.8);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emit(event: AgentEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }
}

/** risk slider: -1 paranoid (ask everything) .. +1 yolo (allow everything) */
export function autoAllows(riskSetting: number, toolRisk: RiskLevel): boolean {
  if (toolRisk === 0) {
    return true;
  }
  if (toolRisk === 1) {
    return riskSetting > -0.33;
  }
  return riskSetting > 0.5;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

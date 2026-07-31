import type { ComponentType } from "react";
import type { WinId } from "../state/windows";
import type { ResizeSpec } from "../wm/Window";
import { HeadTile } from "./HeadTile";
import { MainTile } from "./MainTile";
import { McpTile } from "./McpTile";
import { QueueTile } from "./QueueTile";
import { SkinLabTile } from "./SkinLabTile";
import { TerminalTile } from "./TerminalTile";
import { TodosTile } from "./TodosTile";
import { TunerTile } from "./TunerTile";
import { VisTile } from "./VisTile";

export interface WindowDef {
  readonly title: string;
  readonly component: ComponentType;
  readonly resize?: ResizeSpec;
  /** renders its own chrome (the .wsz head unit); skip the Win wrapper */
  readonly frameless?: true;
}

/**
 * Winamp's playlist resized in 25x29px segments; at our 2x pixel scale
 * that's 50x58.
 */
const STEP = { w: 50, h: 58 } as const;

export const WINDOW_DEFS: Readonly<Record<WinId, WindowDef>> = {
  main: { title: "GROKAMP", component: MainTile },
  tuner: { title: "HARNESS TUNER", component: TunerTile },
  queue: {
    title: "TASK QUEUE",
    component: QueueTile,
    resize: { min: { w: 450, h: 202 }, step: STEP },
  },
  terminal: {
    title: "TERMINAL",
    component: TerminalTile,
    resize: { min: { w: 470, h: 260 }, step: STEP },
  },
  vis: {
    title: "VISUALIZER",
    component: VisTile,
    resize: { min: { w: 420, h: 202 }, step: STEP },
  },
  todos: {
    title: "TODO LIST",
    component: TodosTile,
    resize: { min: { w: 320, h: 186 }, step: STEP },
  },
  mcp: {
    title: "MCP SERVERS",
    component: McpTile,
    resize: { min: { w: 320, h: 160 }, step: STEP },
  },
  skinlab: {
    title: "SKIN LAB",
    component: SkinLabTile,
    resize: { min: { w: 370, h: 260 }, step: STEP },
  },
  head: { title: "HEAD UNIT", component: HeadTile, frameless: true },
};

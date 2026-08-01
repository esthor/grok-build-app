import type { ComponentType } from "react";
import type { WinId } from "../state/windows";
import type { Rect } from "../wm/tile";
import { HeadTile } from "./HeadTile";
import { MainTile } from "./MainTile";
import { McpTile } from "./McpTile";
import { MuseumTile } from "./MuseumTile";
import { QueueTile } from "./QueueTile";
import { SkinLabTile } from "./SkinLabTile";
import { TerminalTile } from "./TerminalTile";
import { TodosTile } from "./TodosTile";
import { TunerTile } from "./TunerTile";
import { VisTile } from "./VisTile";

/**
 * Every tile is handed the rect the tiler assigned it, plus the workspace
 * frame. Most ignore both; canvas tiles size themselves from `rect`, and the
 * frameless head unit positions its own chrome inside it.
 */
export interface TileProps {
  readonly rect: Rect;
  readonly frame: Rect;
}

export interface WindowDef {
  readonly title: string;
  readonly component: ComponentType<TileProps>;
  /** renders its own chrome (the .wsz head unit); skip the Win wrapper */
  readonly frameless?: true;
}

export const WINDOW_DEFS: Readonly<Record<WinId, WindowDef>> = {
  main: { title: "GROKAMP", component: MainTile },
  tuner: { title: "HARNESS TUNER", component: TunerTile },
  queue: { title: "TASK QUEUE", component: QueueTile },
  terminal: { title: "TERMINAL", component: TerminalTile },
  vis: { title: "VISUALIZER", component: VisTile },
  todos: { title: "TODO LIST", component: TodosTile },
  mcp: { title: "MCP SERVERS", component: McpTile },
  skinlab: { title: "SKIN LAB", component: SkinLabTile },
  head: { title: "HEAD UNIT", component: HeadTile, frameless: true },
  museum: { title: "SKIN MUSEUM", component: MuseumTile },
};

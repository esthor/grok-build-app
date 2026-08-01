import { useStore } from "@tanstack/react-store";
import type { ReactNode } from "react";
import { settingsStore, updateSettings, type VisMode } from "../state/settings";
import { LcdText, SquareBtn } from "../ui/controls";
import { VisCanvas } from "../vis/VisCanvas";
import type { TileProps } from "./registry";

const MODES: readonly { id: VisMode; label: string }[] = [
  { id: "spectrum", label: "SPEC" },
  { id: "scope", label: "SCOPE" },
  { id: "plasma", label: "PLASMA" },
  { id: "off", label: "OFF" },
];

export function VisTile({ rect }: TileProps): ReactNode {
  const mode = useStore(settingsStore, (s) => s.visMode);

  // the tiler owns the geometry; the canvas just fills what it was given
  const canvasW = Math.max(160, rect.w - 20);
  const canvasH = Math.max(80, rect.h - 28 - 52);

  return (
    <div className="vis-tile">
      <div className="vis-stage lcd">
        <VisCanvas width={canvasW} height={canvasH} clickCycles />
      </div>
      <div className="vis-modes">
        {MODES.map((m) => (
          <SquareBtn
            key={m.id}
            title={`visualizer: ${m.id}`}
            lit={mode === m.id}
            onClick={() => {
              updateSettings({ visMode: m.id });
            }}
          >
            {m.label}
          </SquareBtn>
        ))}
        <span className="vis-hint">
          <LcdText dim>fed by token flow + tool calls</LcdText>
        </span>
      </div>
    </div>
  );
}

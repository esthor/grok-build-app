import { useStore } from "@tanstack/react-store";
import { useEffect, useRef, type ReactNode } from "react";
import { readAnalyserFrame } from "../agent/controller";
import { sessionStore } from "../state/session";
import { currentSkin, settingsStore, updateSettings, type VisMode } from "../state/settings";
import type { VisPalette } from "../skins/types";
import {
  createVisState,
  drawOff,
  drawPlasma,
  drawScope,
  drawSpectrum,
} from "./render";

const MODE_ORDER: readonly VisMode[] = ["spectrum", "scope", "plasma", "off"];

export function cycleVisMode(): void {
  const current = settingsStore.state.visMode;
  const index = MODE_ORDER.indexOf(current);
  const next = MODE_ORDER[(index + 1) % MODE_ORDER.length] ?? "spectrum";
  updateSettings({ visMode: next });
}

function rainbowPalette(): VisPalette {
  const colors: string[] = ["#000000", "#222222"];
  for (let i = 0; i < 16; i++) {
    colors.push(`hsl(${(i * 24 + (Date.now() / 20) % 360) % 360} 100% 55%)`);
  }
  for (let i = 0; i < 5; i++) {
    colors.push(`hsl(${(i * 60) % 360} 100% 60%)`);
  }
  colors.push("#ffffff");
  return colors;
}

interface VisCanvasProps {
  readonly width: number;
  readonly height: number;
  /** fill parent instead of fixed size */
  readonly stretch?: boolean;
  readonly clickCycles?: boolean;
}

/** the shared oscilloscope-of-the-agent; click cycles modes like 1997 */
export function VisCanvas({
  width,
  height,
  stretch = false,
  clickCycles = true,
}: VisCanvasProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mode = useStore(settingsStore, (s) => s.visMode);
  const skinName = useStore(settingsStore, (s) => s.skinName);
  const customCount = useStore(settingsStore, (s) => s.customSkins.length);
  const llamaUntil = useStore(sessionStore, (s) => s.llamaUntil);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    const state = createVisState();
    let raf = 0;
    const frame = (): void => {
      readAnalyserFrame(state.bands, state.scope);
      const llama = Date.now() < llamaUntil;
      const palette = llama ? rainbowPalette() : currentSkin().vis;
      const w = canvas.width;
      const h = canvas.height;
      switch (mode) {
        case "spectrum":
          drawSpectrum(ctx, w, h, state, palette);
          break;
        case "scope":
          drawScope(ctx, w, h, state, palette);
          break;
        case "plasma":
          drawPlasma(ctx, w, h, state, palette);
          break;
        case "off":
          drawOff(ctx, w, h, palette);
          break;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [mode, skinName, customCount, llamaUntil]);

  return (
    <canvas
      ref={canvasRef}
      className="vis-canvas"
      width={width}
      height={height}
      style={stretch ? { width: "100%", height: "100%" } : { width, height }}
      title={clickCycles ? `vis: ${mode} (click to cycle)` : `vis: ${mode}`}
      onClick={clickCycles ? cycleVisMode : undefined}
    />
  );
}

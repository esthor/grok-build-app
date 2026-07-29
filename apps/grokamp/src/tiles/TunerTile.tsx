import { useStore } from "@tanstack/react-store";
import type { ReactNode } from "react";
import {
  applyPreset,
  setBand,
  settingsStore,
  TUNER_BANDS,
  TUNER_PRESETS,
  updateSettings,
} from "../state/settings";
import { Slider, SquareBtn } from "../ui/controls";

/** the green EQ curve, reborn as a harness response curve */
function Curve({ bands, on }: { readonly bands: readonly number[]; readonly on: boolean }): ReactNode {
  const w = 196;
  const h = 48;
  const points = bands
    .map((value, i) => {
      const x = 6 + (i / (bands.length - 1)) * (w - 12);
      const y = h - 6 - (value / 100) * (h - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="tuner-curve-svg" aria-hidden="true">
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--sk-lcdDim)" strokeWidth="1" opacity="0.5" />
      <polyline
        points={points}
        fill="none"
        stroke={on ? "var(--sk-lcdText)" : "var(--sk-lcdDim)"}
        strokeWidth="2"
      />
    </svg>
  );
}

export function TunerTile(): ReactNode {
  const settings = useStore(settingsStore);

  return (
    <div className="tuner-tile" data-on={settings.tunerOn ? "yes" : "no"}>
      <div className="tuner-top">
        <div className="tuner-curve lcd">
          <Curve bands={settings.bands} on={settings.tunerOn} />
        </div>
        <div className="tuner-head">
          <div className="tuner-head-btns">
            <SquareBtn
              title="tuner on/off — off pins effort to neutral"
              lit={settings.tunerOn}
              onClick={() => {
                updateSettings({ tunerOn: !settings.tunerOn });
              }}
            >
              ON
            </SquareBtn>
            <SquareBtn
              title="auto: pick a preset per task"
              lit={settings.tunerAuto}
              onClick={() => {
                updateSettings({ tunerAuto: !settings.tunerAuto });
              }}
            >
              AUTO
            </SquareBtn>
          </div>
          <select
            className="tuner-preset"
            title="presets"
            value=""
            onChange={(e) => {
              const preset = TUNER_PRESETS.find((p) => p.name === e.target.value);
              if (preset !== undefined) {
                applyPreset(preset);
              }
            }}
          >
            <option value="" disabled>
              PRESETS
            </option>
            {TUNER_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tuner-sliders">
        <div className="tuner-preamp" title="reasoning effort (the preamp)">
          <Slider
            vertical
            value={settings.effort}
            min={0}
            max={100}
            onChange={(v) => {
              updateSettings({ effort: v });
            }}
            title="EFFORT"
          />
          <span className="mini-label">EFFORT</span>
        </div>
        <div className="tuner-divider" />
        {TUNER_BANDS.map((band, i) => (
          <div className="tuner-band" key={band.id} title={band.hint}>
            <Slider
              vertical
              value={settings.bands[i] ?? 50}
              min={0}
              max={100}
              onChange={(v) => {
                setBand(i, v);
              }}
              title={band.hint}
            />
            <span className="mini-label">{band.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

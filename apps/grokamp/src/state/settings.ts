import { Store } from "@tanstack/store";
import { BUILTIN_SKINS, DEFAULT_SKIN_NAME } from "../skins/builtins";
import { applySkin, parseSkin } from "../skins/runtime";
import type { Skin } from "../skins/types";
import { debounced, loadPersisted, savePersisted } from "./persist";

export type VisMode = "spectrum" | "scope" | "plasma" | "off";

export interface TunerBand {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

/** the 10 dials of a coding-agent harness (EQ bands, spiritually) */
export const TUNER_BANDS: readonly TunerBand[] = [
  { id: "temp", label: "TMP", hint: "sampling temperature" },
  { id: "plan", label: "PLN", hint: "planning appetite" },
  { id: "ctx", label: "CTX", hint: "context thrift" },
  { id: "par", label: "PAR", hint: "parallel tool calls" },
  { id: "test", label: "TST", hint: "test rigor" },
  { id: "web", label: "WEB", hint: "web research" },
  { id: "mem", label: "MEM", hint: "memory writes" },
  { id: "verb", label: "VRB", hint: "verbosity" },
  { id: "safe", label: "SFT", hint: "safety margin" },
  { id: "fun", label: "FUN", hint: "whimsy" },
];

export interface TunerPreset {
  readonly name: string;
  readonly effort: number;
  readonly bands: readonly number[];
}

/** band values are 0..100 with 50 = flat, like a centered EQ slider */
export const TUNER_PRESETS: readonly TunerPreset[] = [
  { name: "Flat", effort: 50, bands: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50] },
  { name: "Pair Prog", effort: 55, bands: [45, 60, 55, 40, 70, 40, 60, 65, 70, 55] },
  { name: "Deep Research", effort: 90, bands: [55, 85, 30, 70, 50, 95, 75, 70, 60, 35] },
  { name: "YOLO Friday", effort: 35, bands: [80, 20, 60, 90, 15, 55, 30, 35, 5, 95] },
  { name: "Prod Incident", effort: 75, bands: [20, 70, 75, 60, 90, 65, 50, 45, 95, 5] },
  { name: "Refactor Zen", effort: 65, bands: [35, 75, 55, 50, 85, 25, 65, 40, 80, 30] },
];

export interface SettingsState {
  readonly skinName: string;
  readonly customSkins: readonly Skin[];
  readonly doubleSize: boolean;
  readonly alwaysOnTop: boolean;
  /** volume slider, 0..100 */
  readonly throttle: number;
  /** balance slider, -100 (paranoid) .. 100 (yolo) */
  readonly risk: number;
  readonly visMode: VisMode;
  readonly tunerOn: boolean;
  /** auto: pick a preset per task, like winamp's per-song EQ auto */
  readonly tunerAuto: boolean;
  /** preamp, 0..100 */
  readonly effort: number;
  readonly bands: readonly number[];
}

const DEFAULT_SETTINGS: SettingsState = {
  skinName: DEFAULT_SKIN_NAME,
  customSkins: [],
  doubleSize: false,
  alwaysOnTop: true,
  throttle: 65,
  risk: 0,
  visMode: "spectrum",
  tunerOn: true,
  tunerAuto: false,
  effort: 60,
  bands: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
};

function decodeSettings(raw: unknown): SettingsState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const merged: SettingsState = {
    ...DEFAULT_SETTINGS,
    ...(typeof record["skinName"] === "string" ? { skinName: record["skinName"] } : {}),
    ...(typeof record["doubleSize"] === "boolean" ? { doubleSize: record["doubleSize"] } : {}),
    ...(typeof record["alwaysOnTop"] === "boolean"
      ? { alwaysOnTop: record["alwaysOnTop"] }
      : {}),
    ...(typeof record["throttle"] === "number" ? { throttle: record["throttle"] } : {}),
    ...(typeof record["risk"] === "number" ? { risk: record["risk"] } : {}),
    ...(typeof record["tunerOn"] === "boolean" ? { tunerOn: record["tunerOn"] } : {}),
    ...(typeof record["tunerAuto"] === "boolean" ? { tunerAuto: record["tunerAuto"] } : {}),
    ...(typeof record["effort"] === "number" ? { effort: record["effort"] } : {}),
  };
  const visMode = record["visMode"];
  const withVis: SettingsState =
    visMode === "spectrum" || visMode === "scope" || visMode === "plasma" || visMode === "off"
      ? { ...merged, visMode }
      : merged;
  const bands = record["bands"];
  const withBands: SettingsState =
    Array.isArray(bands) && bands.length === 10 && bands.every((b) => typeof b === "number")
      ? { ...withVis, bands: bands as number[] }
      : withVis;
  const customSkins = record["customSkins"];
  if (Array.isArray(customSkins)) {
    const parsed: Skin[] = [];
    for (const c of customSkins) {
      const result = parseSkin(c);
      if (result.ok) {
        parsed.push(result.skin);
      }
    }
    return { ...withBands, customSkins: parsed };
  }
  return withBands;
}

export const settingsStore = new Store<SettingsState>(
  loadPersisted("settings", decodeSettings) ?? DEFAULT_SETTINGS,
);

const persistSettings = debounced(() => {
  savePersisted("settings", settingsStore.state);
}, 250);

settingsStore.subscribe(persistSettings);

export function allSkins(): readonly Skin[] {
  return [...BUILTIN_SKINS, ...settingsStore.state.customSkins];
}

export function findSkin(name: string): Skin | null {
  return allSkins().find((s) => s.name === name) ?? null;
}

export function currentSkin(): Skin {
  const found = findSkin(settingsStore.state.skinName);
  const fallback = BUILTIN_SKINS[0];
  if (fallback === undefined) {
    throw new Error("no builtin skins registered");
  }
  return found ?? fallback;
}

export function setSkin(name: string): void {
  const skin = findSkin(name);
  if (skin === null) {
    return;
  }
  settingsStore.setState((s) => ({ ...s, skinName: name }));
  applySkin(skin);
}

export function upsertCustomSkin(skin: Skin): void {
  settingsStore.setState((s) => ({
    ...s,
    customSkins: [...s.customSkins.filter((c) => c.name !== skin.name), skin],
    skinName: skin.name,
  }));
  applySkin(skin);
}

export function updateSettings(patch: Partial<SettingsState>): void {
  settingsStore.setState((s) => ({ ...s, ...patch }));
}

export function setBand(index: number, value: number): void {
  settingsStore.setState((s) => {
    const bands = s.bands.map((b, i) => (i === index ? value : b));
    return { ...s, bands };
  });
}

export function applyPreset(preset: TunerPreset): void {
  settingsStore.setState((s) => ({
    ...s,
    effort: preset.effort,
    bands: [...preset.bands],
  }));
}

/** boot-time paint */
export function initSkin(): void {
  applySkin(currentSkin());
}

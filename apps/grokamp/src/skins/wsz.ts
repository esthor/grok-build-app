import { unzipSync } from "fflate";
import { Store } from "@tanstack/store";
import { buildVis, lerpHex } from "./ramp";
import type { Skin, SkinColors } from "./types";

/**
 * Classic Winamp .wsz support — the emulator approach.
 *
 * Grokamp ships NO Winamp artwork. The user supplies their own .wsz (a
 * renamed zip of BMP sprite sheets + txt configs); we unzip it client-side
 * and blit its pixels at the classic sprite coordinates. Pixel fidelity is
 * structural: whatever art is in the file is what you see. Coordinates
 * follow the community-documented classic-skin format (see docs/WINAMP.md).
 *
 * Format quirks honored (researched from the classic format + Webamp's
 * loader notes): entry names match case-insensitively and directory-
 * agnostically; duplicate entries -> last one wins; missing files are fine
 * (elements simply don't render); viscolor.txt is parsed leniently.
 */

export type SheetName =
  | "main"
  | "titlebar"
  | "cbuttons"
  | "numbers"
  | "text"
  | "monoster"
  | "playpaus"
  | "posbar"
  | "shufrep"
  | "volume"
  | "balance";

const SHEET_FILES: readonly SheetName[] = [
  "main",
  "titlebar",
  "cbuttons",
  "numbers",
  "text",
  "monoster",
  "playpaus",
  "posbar",
  "shufrep",
  "volume",
  "balance",
];

export interface PleditColors {
  readonly normal: string;
  readonly current: string;
  readonly normalBg: string;
  readonly selectedBg: string;
}

export interface WszSkin {
  readonly name: string;
  readonly sheets: Partial<Record<SheetName, ImageBitmap>>;
  readonly viscolor: readonly string[] | null;
  readonly pledit: PleditColors | null;
}

/** the currently worn .wsz, if any (drives the HEAD UNIT window) */
export const wszStore = new Store<WszSkin | null>(null);

/** ImageBitmaps hold decoded graphics memory; release them deterministically */
export function disposeWsz(skin: WszSkin | null): void {
  if (skin === null) {
    return;
  }
  for (const sheet of Object.values(skin.sheets)) {
    sheet?.close();
  }
}

/** the only writer of wszStore: closes the previous skin's bitmaps first */
export function setWornWsz(next: WszSkin | null): void {
  const prev = wszStore.state;
  if (prev !== null && prev !== next) {
    disposeWsz(prev);
  }
  wszStore.setState(() => next);
}

/** case-insensitive, directory-agnostic, last-entry-wins zip lookup */
export function pickEntry(
  files: Readonly<Record<string, Uint8Array>>,
  baseName: string,
): Uint8Array | null {
  const want = baseName.toLowerCase();
  let found: Uint8Array | null = null;
  for (const [path, data] of Object.entries(files)) {
    const leaf = path.replaceAll("\\", "/").split("/").pop()?.toLowerCase();
    if (leaf === want) {
      found = data; // keep scanning: last one wins
    }
  }
  return found;
}

/** viscolor.txt: up to 24 lines of "R,G,B" with trailing junk tolerated */
export function parseViscolor(text: string): string[] | null {
  const colors: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(line);
    if (match === null) {
      continue;
    }
    const [, r, g, b] = match;
    const to = (v: string | undefined): number => Math.min(255, Number.parseInt(v ?? "0", 10));
    colors.push(
      `#${[to(r), to(g), to(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`,
    );
    if (colors.length === 24) {
      break;
    }
  }
  return colors.length === 24 ? colors : colors.length > 0 ? padVis(colors) : null;
}

function padVis(colors: string[]): string[] {
  const last = colors[colors.length - 1] ?? "#000000";
  while (colors.length < 24) {
    colors.push(last);
  }
  return colors;
}

/** pledit.txt: INI-ish [Text] section; #-prefix normalized, 7 chars kept */
export function parsePledit(text: string): PleditColors | null {
  const get = (key: string): string | null => {
    const match = new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, "im").exec(text);
    if (match?.[1] === undefined) {
      return null;
    }
    const raw = match[1].startsWith("#") ? match[1] : `#${match[1]}`;
    const hex = raw.slice(0, 7);
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
  };
  const normal = get("Normal");
  const current = get("Current");
  const normalBg = get("NormalBG");
  const selectedBg = get("SelectedBG");
  if (normal === null && current === null && normalBg === null && selectedBg === null) {
    return null;
  }
  return {
    normal: normal ?? "#00ff00",
    current: current ?? "#ffffff",
    normalBg: normalBg ?? "#000000",
    selectedBg: selectedBg ?? "#0000ff",
  };
}

async function decodeBmp(bytes: Uint8Array): Promise<ImageBitmap | null> {
  try {
    const copy = new Uint8Array(bytes); // detach from the zip buffer
    const blob = new Blob([copy.buffer], { type: "image/bmp" });
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/** unzip + decode a .wsz into sprite sheets and config colors */
export async function loadWsz(bytes: Uint8Array, name: string): Promise<WszSkin> {
  const files = unzipSync(bytes);
  const sheets: Partial<Record<SheetName, ImageBitmap>> = {};
  for (const sheet of SHEET_FILES) {
    const entry = pickEntry(files, `${sheet}.bmp`) ?? pickEntry(files, `${sheet}.png`);
    if (entry !== null) {
      const bitmap = await decodeBmp(entry);
      if (bitmap !== null) {
        sheets[sheet] = bitmap;
      }
    }
  }
  const visRaw = pickEntry(files, "viscolor.txt");
  const pleditRaw = pickEntry(files, "pledit.txt");
  const decoder = new TextDecoder("latin1");
  return {
    name,
    sheets,
    viscolor: visRaw !== null ? parseViscolor(decoder.decode(visRaw)) : null,
    pledit: pleditRaw !== null ? parsePledit(decoder.decode(pleditRaw)) : null,
  };
}

// ---------------------------------------------------------------- sampling

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function samplePatch(
  data: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let py = y; py < y + h && py < data.height; py++) {
    for (let px = x; px < x + w && px < data.width; px++) {
      const i = (py * data.width + px) * 4;
      rs.push(data.data[i] ?? 0);
      gs.push(data.data[i + 1] ?? 0);
      bs.push(data.data[i + 2] ?? 0);
    }
  }
  if (rs.length === 0) {
    return "#808080";
  }
  const to = (n: number): string => Math.round(n).toString(16).padStart(2, "0");
  return `#${to(median(rs))}${to(median(gs))}${to(median(bs))}`;
}

function imageDataOf(bitmap: ImageBitmap): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Derive a full Grokamp palette from the worn skin so every other window
 * re-wears to match the head unit. Exact where the format is exact
 * (viscolor, pledit); sampled medians for chrome; luminance-derived edges.
 */
export function deriveGrokampSkin(wsz: WszSkin): Skin {
  const mainData = wsz.sheets.main !== undefined ? imageDataOf(wsz.sheets.main) : null;
  const titleData = wsz.sheets.titlebar !== undefined ? imageDataOf(wsz.sheets.titlebar) : null;
  const btnData = wsz.sheets.cbuttons !== undefined ? imageDataOf(wsz.sheets.cbuttons) : null;
  const volData = wsz.sheets.volume !== undefined ? imageDataOf(wsz.sheets.volume) : null;

  const chrome =
    mainData !== null
      ? samplePatch(mainData, 150, 80, 12, 8)
      : "#43474f";
  const titleA = titleData !== null ? samplePatch(titleData, 40 + 27, 4, 20, 6) : "#101c3c";
  const titleB = titleData !== null ? samplePatch(titleData, 120 + 27, 4, 30, 6) : "#3f5aa8";
  const btnFace = btnData !== null ? samplePatch(btnData, 26, 4, 10, 8) : "#4c515a";
  const sliderThumb = volData !== null ? samplePatch(volData, 16, 424, 10, 6) : "#9096a1";

  const vis = wsz.viscolor;
  const lcdBg = vis?.[0] ?? "#000000";
  const lcdText = wsz.pledit?.normal ?? vis?.[17] ?? "#00e800";
  const titleText = luminance(titleB) > 0.55 ? "#101010" : "#f0f0f5";
  const btnText = luminance(btnFace) > 0.55 ? "#141414" : "#eeeeee";

  const colors: SkinColors = {
    desktop: lerpHex(chrome, "#000000", 0.72),
    chrome,
    chromeDeep: lerpHex(chrome, "#000000", 0.4),
    edgeLight: lerpHex(chrome, "#ffffff", 0.38),
    edgeDark: lerpHex(chrome, "#000000", 0.65),
    titleA,
    titleB,
    titleText,
    titleTextDim: lerpHex(titleText, chrome, 0.5),
    lcdBg,
    lcdText,
    lcdDim: lerpHex(lcdText, lcdBg, 0.55),
    lcdAccent: lerpHex(lcdText, "#ffffff", 0.35),
    btnFace,
    btnText,
    sliderTrack: lerpHex(chrome, "#000000", 0.55),
    sliderThumb,
    listBg: wsz.pledit?.normalBg ?? lcdBg,
    listText: wsz.pledit?.normal ?? lcdText,
    listCurrent: wsz.pledit?.current ?? "#ffffff",
    listSelBg: wsz.pledit?.selectedBg ?? lerpHex(chrome, "#0000c6", 0.5),
    ok: lcdText,
    warn: "#ffbf00",
    err: "#ff4136",
    ledOff: lerpHex(chrome, "#000000", 0.45),
  };

  return {
    name: `${wsz.name} (wsz)`,
    author: "derived from .wsz",
    comment: "palette derived client-side from a user-supplied classic skin",
    colors,
    vis:
      vis ??
      buildVis({
        bg: colors.lcdBg,
        grid: lerpHex(colors.lcdBg, colors.lcdDim, 0.3),
        spectrum: [colors.lcdAccent, colors.lcdText, colors.lcdDim],
        scope: [colors.lcdText, colors.lcdDim, colors.lcdDim],
        peak: colors.lcdAccent,
      }),
    radius: 0,
  };
}

// ------------------------------------------------------------- persistence

const WSZ_KEY = "grokamp.v1.wsz";
const MAX_PERSIST_BYTES = 1_500_000;
/** base64 expands 4/3 and JSON adds metadata; bound what actually hits storage */
const MAX_SERIALIZED_CHARS = 2_200_000;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** returns false when the skin is worn session-only (too big / storage full) */
export function persistWsz(bytes: Uint8Array, name: string): boolean {
  if (bytes.length > MAX_PERSIST_BYTES) {
    return false;
  }
  try {
    const payload = JSON.stringify({ name, b64: toBase64(bytes) });
    if (payload.length > MAX_SERIALIZED_CHARS) {
      return false;
    }
    window.localStorage.setItem(WSZ_KEY, payload);
    return true;
  } catch {
    return false; // quota exceeded — non-fatal
  }
}

export async function rehydrateWsz(): Promise<WszSkin | null> {
  try {
    const raw = window.localStorage.getItem(WSZ_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as { name?: unknown; b64?: unknown };
    if (typeof parsed.name !== "string" || typeof parsed.b64 !== "string") {
      return null;
    }
    const skin = await loadWsz(fromBase64(parsed.b64), parsed.name);
    setWornWsz(skin);
    return skin;
  } catch {
    return null;
  }
}

export function forgetWsz(): void {
  try {
    window.localStorage.removeItem(WSZ_KEY);
  } catch {
    // fine
  }
  setWornWsz(null);
}

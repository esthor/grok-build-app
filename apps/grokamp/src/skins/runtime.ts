import { buildVis } from "./ramp";
import { SKIN_COLOR_KEYS, type Skin, type SkinColors } from "./types";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** paint a skin onto the document as CSS custom properties */
export function applySkin(skin: Skin): void {
  const root = document.documentElement;
  for (const key of SKIN_COLOR_KEYS) {
    root.style.setProperty(`--sk-${key}`, skin.colors[key]);
  }
  root.style.setProperty("--sk-visBg", skin.vis[0] ?? skin.colors.lcdBg);
  root.style.setProperty("--sk-radius", `${skin.radius ?? 0}px`);
  root.dataset["scanlines"] = skin.scanlines === true ? "on" : "off";
}

export type SkinParseResult =
  | { readonly ok: true; readonly skin: Skin }
  | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/**
 * Strict-but-friendly loader for user skins. Colors must all be present and
 * hex; the 24-slot vis palette is optional (we synthesize one from the LCD
 * colors, so a hand-typed skin stays a ~30 line file).
 */
export function parseSkin(input: unknown): SkinParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: "skin must be a JSON object" };
  }
  const name = input["name"];
  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, error: 'missing "name"' };
  }
  const rawColors = input["colors"];
  if (!isRecord(rawColors)) {
    return { ok: false, error: 'missing "colors" object' };
  }
  const colors: Partial<Record<keyof SkinColors, string>> = {};
  for (const key of SKIN_COLOR_KEYS) {
    const value = rawColors[key];
    if (!isHexColor(value)) {
      return { ok: false, error: `colors.${key} must be a hex color like #22cc88` };
    }
    colors[key] = value;
  }
  const complete = colors as SkinColors;

  let vis: readonly string[] | null = null;
  const rawVis = input["vis"];
  if (rawVis !== undefined) {
    if (!Array.isArray(rawVis) || rawVis.length > 24 || !rawVis.every(isHexColor)) {
      return { ok: false, error: '"vis" must be up to 24 hex colors' };
    }
    vis = rawVis;
  }

  const scanlines = input["scanlines"];
  if (scanlines !== undefined && typeof scanlines !== "boolean") {
    return { ok: false, error: '"scanlines" must be a boolean' };
  }
  const radius = input["radius"];
  if (radius !== undefined && (typeof radius !== "number" || radius < 0 || radius > 16)) {
    return { ok: false, error: '"radius" must be a number 0..16' };
  }
  const author = input["author"];
  const comment = input["comment"];

  const skin: Skin = {
    name: name.trim(),
    ...(typeof author === "string" ? { author } : {}),
    ...(typeof comment === "string" ? { comment } : {}),
    colors: complete,
    vis:
      vis ??
      buildVis({
        bg: complete.lcdBg,
        grid: complete.chromeDeep,
        spectrum: [complete.lcdAccent, complete.lcdText, complete.lcdDim],
        scope: [complete.lcdText, complete.lcdDim, complete.lcdDim],
        peak: complete.lcdAccent,
      }),
    ...(scanlines !== undefined ? { scanlines } : {}),
    ...(radius !== undefined ? { radius } : {}),
  };
  return { ok: true, skin };
}

/** serialize for the Skin Lab export button */
export function skinToJson(skin: Skin): string {
  return `${JSON.stringify(skin, null, 2)}\n`;
}

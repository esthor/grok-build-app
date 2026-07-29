/**
 * Grokamp classic skin format.
 *
 * Winamp skins were a zip of BMPs anyone could repaint in MS Paint. Ours is
 * one JSON file anyone can retype in a text editor. Same energy: no build
 * step, no code, drop it in and the whole app rewears itself.
 */

export interface SkinColors {
  /** app background behind all windows */
  readonly desktop: string;
  /** window face */
  readonly chrome: string;
  /** recessed panel face */
  readonly chromeDeep: string;
  /** bevel highlight */
  readonly edgeLight: string;
  /** bevel shadow */
  readonly edgeDark: string;
  /** titlebar gradient start / end (active window) */
  readonly titleA: string;
  readonly titleB: string;
  readonly titleText: string;
  readonly titleTextDim: string;
  /** LCD panels (readouts, marquee) */
  readonly lcdBg: string;
  readonly lcdText: string;
  readonly lcdDim: string;
  readonly lcdAccent: string;
  readonly btnFace: string;
  readonly btnText: string;
  readonly sliderTrack: string;
  readonly sliderThumb: string;
  /** playlist-style lists */
  readonly listBg: string;
  readonly listText: string;
  readonly listCurrent: string;
  readonly listSelBg: string;
  readonly ok: string;
  readonly warn: string;
  readonly err: string;
  readonly ledOff: string;
}

/**
 * viscolor.txt lives on: exactly 24 colors.
 * [0] vis background, [1] grid dots, [2..17] spectrum ramp top->bottom,
 * [18..22] oscilloscope shades, [23] peak caps.
 * Builtins and buildVis always produce all 24; imported skins may omit the
 * field entirely (a palette is synthesized) but may not ship a partial one.
 */
export type VisPalette = readonly string[];

export interface Skin {
  readonly name: string;
  readonly author?: string;
  readonly comment?: string;
  readonly colors: SkinColors;
  readonly vis: VisPalette;
  /** CRT scanline overlay on LCD panels */
  readonly scanlines?: boolean;
  /** window corner radius in px — 0 is the true 1997 experience */
  readonly radius?: number;
}

export const SKIN_COLOR_KEYS = [
  "desktop",
  "chrome",
  "chromeDeep",
  "edgeLight",
  "edgeDark",
  "titleA",
  "titleB",
  "titleText",
  "titleTextDim",
  "lcdBg",
  "lcdText",
  "lcdDim",
  "lcdAccent",
  "btnFace",
  "btnText",
  "sliderTrack",
  "sliderThumb",
  "listBg",
  "listText",
  "listCurrent",
  "listSelBg",
  "ok",
  "warn",
  "err",
  "ledOff",
] as const satisfies readonly (keyof SkinColors)[];

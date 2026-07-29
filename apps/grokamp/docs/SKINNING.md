# SKINNING.md — make a Grokamp skin in five minutes

Winamp skins were a zip of bitmaps you repainted in MS Paint. Grokamp skins
are **one JSON file you can retype in any editor**. Same contract, same
spirit:

- **No code, no build step.** Drop the file in, the whole app rewears itself.
- **Graceful fallback.** Only `name` + the 25 colors are required; everything
  else is synthesized (Winamp let you ship a skin containing just
  `main.bmp`).
- **The vis palette is honored like `viscolor.txt`** — 24 slots, same
  meanings, 28 years later.

## Fastest path: the Skin Lab

Open the **LAB** window (button on the main deck, or `Alt+8`):

1. Pick any installed skin as a starting point.
2. Click color swatches until it's yours. Name it.
3. **APPLY** — it's live and persisted.
4. **EXPORT** — downloads `your-skin.grokskin.json` to share.
5. **IMPORT** — load anyone else's. **RANDOM** — roll the dice.

## The format

```jsonc
{
  "name": "Night Drive",           // required, unique-ish
  "author": "you",                 // optional
  "comment": "neon autobahn",      // optional
  "colors": {                      // all 25 required, hex only
    "desktop":      "#0b0f1c",     // app background
    "chrome":       "#1c2438",     // window face
    "chromeDeep":   "#111726",     // recessed panels
    "edgeLight":    "#3d4d78",     // bevel highlight
    "edgeDark":     "#05070d",     // bevel shadow
    "titleA":       "#7a1fa2",     // titlebar gradient edges
    "titleB":       "#ff2079",     // titlebar gradient center
    "titleText":    "#ffe9ff",
    "titleTextDim": "#8a7f9e",     // unfocused windows
    "lcdBg":        "#04020a",     // readout panels
    "lcdText":      "#ff9e00",     // primary LCD glow
    "lcdDim":       "#7a4c00",     // unlit segments, quiet text
    "lcdAccent":    "#ffe08a",     // highlights, tool lines
    "btnFace":      "#26304a",
    "btnText":      "#dfe6ff",
    "sliderTrack":  "#0a0d18",
    "sliderThumb":  "#5a6ea6",
    "listBg":       "#04020a",     // task queue background
    "listText":     "#ff9e00",     //  → pledit.txt "Normal"
    "listCurrent":  "#ffffff",     //  → pledit.txt "Current"
    "listSelBg":    "#33205a",     //  → pledit.txt "SelectedBG"
    "ok":           "#3ddc84",
    "warn":         "#ffbf00",
    "err":          "#ff4136",
    "ledOff":       "#1a2032"
  },
  "vis": ["#04020a", "#141020", "..."],  // optional, up to 24 (see below)
  "scanlines": true,                      // optional CRT overlay on LCDs
  "radius": 0                             // window corners, px (0 = 1997)
}
```

### The `vis` palette (viscolor.txt lives on)

| slots | meaning |
|---|---|
| 0 | visualizer background |
| 1 | the dotted grid |
| 2–17 | spectrum bar ramp, **top → bottom** (classic ran red→yellow→green) |
| 18–22 | oscilloscope shades |
| 23 | peak caps |

Omit `vis` entirely and Grokamp synthesizes one from your LCD colors — the
same "missing file falls back" contract that made partial Winamp skins valid.

### Validation

Imports run through a strict parser
([`src/skins/runtime.ts`](../src/skins/runtime.ts) — `parseSkin`): every
color must be `#rgb`/`#rrggbb`/`#rrggbbaa`, `radius` 0–16, `vis` ≤ 24 hex
entries. Rejections land in the Terminal with the reason. Skins are **data,
never code** — nothing in a skin file can execute.

### Where skins live

Built-ins ship in [`src/skins/builtins.ts`](../src/skins/builtins.ts) — each
is ~40 lines of data; copy one and PR it. Imported/custom skins persist in
`localStorage` and shadow nothing (a name collision with a builtin gets
` MOD` appended). An example to import right now:
[`examples/night-drive.grokskin.json`](./examples/night-drive.grokskin.json).

### Design notes from the factory floor

- Contrast is a feature: `lcdText` on `lcdBg` should hurt slightly.
- `edgeLight`/`edgeDark` do all the 3D work — keep them believably lit from
  the top-left.
- `titleA→titleB→titleA` paints the gradient; put the loud color in `titleB`.
- Light skins are legal (see **Bubblegum Crash**) — flip the edges.
- Set `scanlines: true` when your skin dreams of phosphor.

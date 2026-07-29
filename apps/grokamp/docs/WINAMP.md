# What made Winamp *Winamp* — the research behind Grokamp

Condensed from a verified research pass (Wikipedia, Jordan Eldredge's Webamp
source + blog, the Winamp Skin Museum, archived skinning tutorials, the 2024
source release). Each section ends with **→ Grokamp**: what we stole.

## 1. The shape of the legend

- Released April 21, 1997 by Justin Frankel (age ~18) and Dmitry Boldyrev;
  "Winamp" = Windows + the AMP decoding engine. $10 honor-system shareware
  from 1998 — no nags, nothing disabled — and it still pulled ~$100k/month in
  paper checks. ~90M monthly users at peak. AOL bought Nullsoft for ~$80–100M
  in 1999 and slowly smothered it; Frankel resigned in 2004 and went on to
  build REAPER.
- Winamp3 (2002, all-new "freeform" engine) flopped; Nullsoft shipped
  Winamp 5 from the Winamp 2 codebase — official joke: *2 + 3 = 5*, and
  "nobody wants to see a Winamp 4 skin."
- The slogan — **"Winamp, it really whips the llama's ass"** — channels
  outsider musician Wesley Willis; the DEMO.MP3 was voiced by radio-imaging
  pro JJ McKay in 1997. Mike the Llama was the mascot.
- Why it beat Sonique/RealJukebox/WMP: tiny download, instant start, played
  everything via plugins, and — decisively — **it was yours**: skins, plugins,
  easter eggs, personality. Corporate players had none of that.
- Alive today: **Webamp** (faithful JS reimplementation, powers the Internet
  Archive's player), **WACUP** (community continuation), and the **Winamp
  Skin Museum** — 100,000+ archived skins, an accidental social archive of
  1998–2005 vernacular design.

**→ Grokamp:** the personality is the product. Ships with easter eggs, a
mascot-grade tagline, and skins as the first-class feature.

## 2. Classic skins — MS Paint was the IDE

A `.wsz` skin is a **renamed zip of BMPs** plus a few text files. The player
blits fixed rectangles from sprite sheets; a skin can repaint everything but
move nothing. Crucial contract: **any missing file falls back to the base
skin**, so a skin containing only `main.bmp` is valid.

Key files: `main.bmp` (275×116 body), `cbuttons.bmp` (transport),
`titlebar.bmp` (incl. **hidden easter-egg title bars** — the llama text is
part of the skin spec!), `volume.bmp` (28 stacked slider frames),
`eqmain.bmp` (whole EQ), `pledit.bmp` (playlist chrome, tiled in 25×29px
segments), `text.bmp` (a 5×6px bitmap font, 3 rows × 31 columns),
`numbers.bmp` (9×13 LED digits), plus:

- **`viscolor.txt`** — exactly 24 `R,G,B` lines: [0] vis background, [1] grid
  dots, [2–17] spectrum ramp top→bottom, [18–22] oscilloscope shades,
  [23] peak caps.
- **`pledit.txt`** — playlist colors (`Normal`, `Current`, `NormalBG`,
  `SelectedBG`) + font.
- **`region.txt`** — polygon lists that *cut window shapes*, 1998's
  transparency.

Ease of creation is the whole story: unzip someone's skin, repaint the BMPs
in MS Paint, re-zip, rename, double-click. No code, no tooling, wrong-sized
art mostly still worked. Result: ~3,000 skins on Winamp.com by 2000 and 100k+
preserved today, made by teenagers about bands, anime, cars, and crushes.

**→ Grokamp:** one **JSON file** is a complete skin (25 named colors; the
24-slot `vis` palette is optional and synthesized if absent — the same
graceful-fallback contract). The Skin Lab tile is our MS Paint: recolor live,
APPLY, EXPORT. See [SKINNING.md](./SKINNING.md).

## 3. The window constellation

- Main window and EQ: **fixed 275×116**. Playlist: minimum 275×116, resizable
  only in **25×29px segments** (the size of its tiling sprites).
- Windows **snap at 10px** to each other and screen edges, and move as a
  docked group. Double-click a titlebar → **windowshade** (collapse to a
  275×14 strip). **Ctrl+D** doubles pixel size. **Ctrl+A** always-on-top.
- Main window anatomy: 9×13 LED time display (click = remaining time; blinks
  when paused), 5×6 bitmap-font song ticker (steps one character every 220ms,
  loops with `  ***  `, only scrolls when text overflows), kbps + kHz
  readouts, mono/stereo lamps, **76×16 visualizer** (click cycles spectrum →
  oscilloscope → off), the **clutterbar** (O-A-I-D-V: Options, Always-on-top,
  file Info, Double-size, Visualization menu), transport, shuffle/repeat,
  volume (28-frame slider), balance (snaps to center), EQ/PL window toggles.
- EQ window: ON/AUTO buttons, PRESETS menu (17 stock presets), a spline curve
  display, preamp + **10 bands at 60/170/310/600/1k/3k/6k/12k/14k/16k Hz**,
  ±12dB.
- Playlist buttons: ADD/REM/SEL/MISC/LIST, each a slide-up 3-item menu;
  13px-tall rows; running time readout bottom-right.
- Spectrum analyzer truth (from Webamp's disassembly-faithful renderer):
  **19 bars of 3px + 1px gap**, peak caps that hold then fall with
  accelerating decay, bar gradient painted top→bottom from viscolor 2–17.

**→ Grokamp:** everything above exists at 2× scale — 550×232 main/tuner
windows, 20px snapping (=10 classic px), shade mode, quantized 50×58 resize
segments, clutterbar with the same letters, click-to-cycle vis with 19 bars
and falling caps, click-for-remaining clock that blinks on pause, stepped
marquee.

## 4. Plugins — the filename prefix was the API

`in_` (input formats — how it played everything), `out_` (audio sinks, incl.
the beloved Disk Writer), `dsp_` (inline effects — `dsp_sc` turned any kid
into a SHOUTcast radio station), `vis_` (AVS by Frankel; **MilkDrop** by Ryan
Geiss, whose `.milk` preset remix culture is the ancestor of shadertoys),
`gen_` (arbitrary UI — the entire modern-skin engine was "just" a gen
plugin), `ml_` (media library). SHOUTcast (1998) bootstrapped internet radio
with inline ICY metadata.

**→ Grokamp:** the taxonomy maps startlingly well onto a coding-agent
harness — see [DESIGN.md](./DESIGN.md#the-plugin-taxonomy-mapping).

## 5. Easter eggs & keyboard culture

- Type **N-U-L-L-S-O-F-T** in the main window (Esc after each L, because L
  opens the file dialog) → titlebar reads "It really whips the llama's ass."
  The hidden titlebar art is a *skinnable sprite* — skinners drew custom
  easter-egg bars.
- The sacred transport row: **Z X C V B** (prev/play/pause/stop/next) — the
  whole player under one hand. J jump-to-file, L open file, R repeat,
  S shuffle, Alt+W/E/G window toggles.

**→ Grokamp:** Z X C V B work. Type `llama` anywhere → rainbow vis + marquee
tribute. And yes — the two l's queue two tasks while you type it, because L
is the eject key. The original egg had exactly this problem; that's why it
was N-U-L-Esc-L-Esc-S-O-F-T. We consider this lore-accurate and refuse to
fix it.

## 6. Sources

Wikipedia (Winamp, Justin Frankel, MilkDrop, AVS, SHOUTcast) · Webamp source
(`skinSprites.ts`, `constants.ts`, `VisPainter.ts`, `Marquee.tsx`,
`snapUtils.ts`, `regionParser.ts`) and jordaneldredge.com (skin museum, skin
loading, corrupted-skins forensics) · skins.webamp.org · Tedium's Wesley
Willis history · eeggs.com entries for the llama eggs · getwacup.com ·
Ars Technica, "Winamp's woes" (2012).

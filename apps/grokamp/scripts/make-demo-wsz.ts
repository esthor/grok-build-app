/**
 * Generates `src/assets/grokamp-classic.wsz` — an ORIGINAL-ART classic-skin
 * demo so the .wsz pipeline is testable and demoable without shipping any
 * Winamp artwork. Every pixel below is drawn by this script. Run:
 *
 *   bun run make:demo-wsz
 */
import { zipSync } from "fflate";

// ---------------------------------------------------------------- bmp out

function encodeBmp(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const rowPad = (4 - ((w * 3) % 4)) % 4;
  const dataSize = (w * 3 + rowPad) * h;
  const fileSize = 54 + dataSize;
  const out = new Uint8Array(fileSize);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; // B
  out[1] = 0x4d; // M
  dv.setUint32(2, fileSize, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, dataSize, true);
  let offset = 54;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      out[offset++] = rgb[i + 2] ?? 0; // B
      out[offset++] = rgb[i + 1] ?? 0; // G
      out[offset++] = rgb[i] ?? 0; // R
    }
    offset += rowPad;
  }
  return out;
}

class Art {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;

  constructor(w: number, h: number, fill: string) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    this.rect(0, 0, w, h, fill);
  }

  set(x: number, y: number, hex: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return;
    }
    const n = Number.parseInt(hex.slice(1), 16);
    const i = (y * this.w + x) * 3;
    this.px[i] = (n >> 16) & 0xff;
    this.px[i + 1] = (n >> 8) & 0xff;
    this.px[i + 2] = n & 0xff;
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.set(px, py, hex);
      }
    }
  }

  /** raised bevel: light top/left, dark bottom/right */
  bevel(x: number, y: number, w: number, h: number, face: string, hi: string, lo: string): void {
    this.rect(x, y, w, h, face);
    this.rect(x, y, w, 1, hi);
    this.rect(x, y, 1, h, hi);
    this.rect(x, y + h - 1, w, 1, lo);
    this.rect(x + w - 1, y, 1, h, lo);
  }

  well(x: number, y: number, w: number, h: number, bg: string): void {
    this.rect(x, y, w, h, bg);
    this.rect(x - 1, y - 1, w + 2, 1, LO);
    this.rect(x - 1, y - 1, 1, h + 2, LO);
    this.rect(x - 1, y + h, w + 2, 1, HI);
    this.rect(x + w, y - 1, 1, h + 2, HI);
  }

  bmp(): Uint8Array {
    return encodeBmp(this.w, this.h, this.px);
  }
}

// ---------------------------------------------------------------- palette

const FACE = "#31353d";
const FACE2 = "#3a3f48";
const HI = "#5b6170";
const LO = "#14161b";
const LCD = "#080a0c";
const GREEN = "#00e800";
const GREEN_DIM = "#0a5a12";
const TEXT = "#dfe3ea";

// ------------------------------------------------------------ 5x6 glyphs
// original blocky font, 5 bits per row (MSB = left column)

const GLYPHS: Readonly<Record<string, readonly number[]>> = {
  a: [0b01110, 0b10001, 0b11111, 0b10001, 0b10001, 0],
  b: [0b11110, 0b10001, 0b11110, 0b10001, 0b11110, 0],
  c: [0b01111, 0b10000, 0b10000, 0b10000, 0b01111, 0],
  d: [0b11110, 0b10001, 0b10001, 0b10001, 0b11110, 0],
  e: [0b11111, 0b10000, 0b11110, 0b10000, 0b11111, 0],
  f: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0],
  g: [0b01111, 0b10000, 0b10011, 0b10001, 0b01111, 0],
  h: [0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0],
  i: [0b11111, 0b00100, 0b00100, 0b00100, 0b11111, 0],
  j: [0b00111, 0b00010, 0b00010, 0b10010, 0b01100, 0],
  k: [0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0],
  l: [0b10000, 0b10000, 0b10000, 0b10000, 0b11111, 0],
  m: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0],
  n: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0],
  o: [0b01110, 0b10001, 0b10001, 0b10001, 0b01110, 0],
  p: [0b11110, 0b10001, 0b11110, 0b10000, 0b10000, 0],
  q: [0b01110, 0b10001, 0b10101, 0b10010, 0b01101, 0],
  r: [0b11110, 0b10001, 0b11110, 0b10100, 0b10010, 0],
  s: [0b01111, 0b10000, 0b01110, 0b00001, 0b11110, 0],
  t: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0],
  u: [0b10001, 0b10001, 0b10001, 0b10001, 0b01110, 0],
  v: [0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0],
  w: [0b10001, 0b10001, 0b10101, 0b11011, 0b10001, 0],
  x: [0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  y: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0],
  z: [0b11111, 0b00010, 0b00100, 0b01000, 0b11111, 0],
  "0": [0b01110, 0b10011, 0b10101, 0b11001, 0b01110, 0],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b01110, 0],
  "2": [0b01110, 0b10001, 0b00110, 0b01000, 0b11111, 0],
  "3": [0b11110, 0b00001, 0b01110, 0b00001, 0b11110, 0],
  "4": [0b10010, 0b10010, 0b11111, 0b00010, 0b00010, 0],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b11110, 0],
  "6": [0b01111, 0b10000, 0b11110, 0b10001, 0b01110, 0],
  "7": [0b11111, 0b00010, 0b00100, 0b01000, 0b01000, 0],
  "8": [0b01110, 0b10001, 0b01110, 0b10001, 0b01110, 0],
  "9": [0b01110, 0b10001, 0b01111, 0b00001, 0b11110, 0],
  "-": [0, 0, 0b01110, 0, 0, 0],
  ".": [0, 0, 0, 0, 0b00100, 0],
  ":": [0, 0b00100, 0, 0b00100, 0, 0],
  "(": [0b00010, 0b00100, 0b00100, 0b00100, 0b00010, 0],
  ")": [0b01000, 0b00100, 0b00100, 0b00100, 0b01000, 0],
  "'": [0b00100, 0b00100, 0, 0, 0, 0],
  "!": [0b00100, 0b00100, 0b00100, 0, 0b00100, 0],
  "/": [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0],
  ",": [0, 0, 0, 0b00100, 0b01000, 0],
  "?": [0b01110, 0b10001, 0b00110, 0, 0b00100, 0],
  "*": [0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
  " ": [0, 0, 0, 0, 0, 0],
};

function drawGlyph(art: Art, char: string, x: number, y: number, color: string): void {
  const rows = GLYPHS[char] ?? GLYPHS[" "] ?? [];
  rows.forEach((bits, row) => {
    for (let col = 0; col < 5; col++) {
      if ((bits >> (4 - col)) & 1) {
        art.set(x + col, y + row, color);
      }
    }
  });
}

// text.bmp layout: row0 a-z + " @ + space(col30); row1 digits + punct
const ROW0 = "abcdefghijklmnopqrstuvwxyz\"@";
const ROW1 = "0123456789….:()-'!_+\\/[]^&%,=$#";

function makeTextSheet(): Art {
  const art = new Art(155, 18, LCD);
  const put = (char: string, row: number, col: number): void => {
    drawGlyph(art, char, col * 5, row * 6, GREEN);
  };
  ROW0.split("").forEach((c, i) => {
    put(c, 0, i);
  });
  ROW1.split("").forEach((c, i) => {
    put(GLYPHS[c] !== undefined ? c : " ", 1, i);
  });
  put("?", 2, 3);
  put("*", 2, 4);
  return art;
}

// numbers.bmp: 10 digits, 9x13, chunky 7-seg style
const SEGS: Readonly<Record<string, readonly string[]>> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

function makeNumbers(): Art {
  const art = new Art(99, 13, LCD);
  const seg = (x0: number, id: string, on: boolean): void => {
    const color = on ? GREEN : GREEN_DIM;
    const boxes: Readonly<Record<string, readonly [number, number, number, number]>> = {
      a: [1, 0, 7, 2],
      b: [7, 1, 2, 5],
      c: [7, 7, 2, 5],
      d: [1, 11, 7, 2],
      e: [0, 7, 2, 5],
      f: [0, 1, 2, 5],
      g: [1, 5, 7, 2],
    };
    const box = boxes[id];
    if (box !== undefined) {
      art.rect(x0 + box[0], box[1], box[2], box[3], color);
    }
  };
  for (let d = 0; d <= 9; d++) {
    const lit = SEGS[String(d)] ?? [];
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
      seg(d * 9, id, lit.includes(id));
    }
  }
  return art;
}

// ------------------------------------------------------------ big sheets

function makeMain(): Art {
  const art = new Art(275, 116, FACE);
  art.rect(0, 0, 275, 1, HI);
  art.rect(0, 0, 1, 116, HI);
  art.rect(0, 115, 275, 1, LO);
  art.rect(274, 0, 1, 116, LO);
  // lcd wells: time, vis, ticker, kbps, khz
  art.well(36, 24, 63, 17, LCD);
  art.well(24, 43, 76, 16, LCD);
  art.well(109, 22, 157, 10, LCD);
  art.well(109, 41, 17, 9, LCD);
  art.well(154, 41, 12, 9, LCD);
  // time colon dots
  art.rect(71, 29, 2, 2, GREEN);
  art.rect(71, 35, 2, 2, GREEN);
  // playstate well
  art.well(24, 26, 12, 12, LCD);
  // slider grooves
  art.well(107, 57, 68, 13, "#20242a");
  art.well(177, 57, 38, 13, "#20242a");
  art.well(16, 72, 248, 10, "#20242a");
  // deco ridges bottom-left
  for (let i = 0; i < 4; i++) {
    art.rect(6, 90 + i * 4, 6, 2, FACE2);
  }
  // wordmark (original): "grokamp classic" in tiny font
  "grokamp classic".split("").forEach((c, i) => {
    drawGlyph(art, c, 140 + i * 6, 8, "#9aa2b0");
  });
  return art;
}

function makeTitlebar(): Art {
  const art = new Art(312, 58, FACE);
  const grad = (y0: number, saturated: boolean): void => {
    for (let x = 0; x < 275; x++) {
      const t = 1 - Math.abs(x - 137) / 137;
      const boost = saturated ? t : t * 0.35;
      const r = Math.round(0x16 + boost * 0x30);
      const g = Math.round(0x20 + boost * 0x42);
      const b = Math.round(0x40 + boost * 0x70);
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
      for (let y = 0; y < 14; y++) {
        art.set(27 + x, y0 + y, hex);
      }
    }
    // ridge deco
    for (const ry of [3, 6, 9]) {
      art.rect(27 + 8, y0 + ry, 88, 1, saturated ? "#6d7fb5" : "#565c6c");
      art.rect(27 + 180, y0 + ry, 60, 1, saturated ? "#6d7fb5" : "#565c6c");
    }
    // title text
    "grokamp".split("").forEach((c, i) => {
      drawGlyph(art, c, 27 + 118 + i * 6, y0 + 4, saturated ? TEXT : "#8a8f9a");
    });
    // buttons: menu, min, shade, close
    for (const [bx, glyph] of [
      [6, "-"],
      [244, "-"],
      [254, "*"],
      [264, "x"],
    ] as const) {
      art.bevel(27 + Number(bx), y0 + 3, 9, 9, FACE2, HI, LO);
      drawGlyph(art, String(glyph), 27 + Number(bx) + 2, y0 + 4, TEXT);
    }
  };
  grad(0, true);
  grad(15, false);
  // clutterbar strip at (304,0) 8x43
  art.rect(304, 0, 8, 43, FACE2);
  "oaidv".split("").forEach((c, i) => {
    drawGlyph(art, c, 305, 1 + i * 8, "#b8bec9");
  });
  return art;
}

function makeCButtons(): Art {
  const art = new Art(136, 36, FACE);
  const widths = [23, 23, 23, 23, 22];
  const draw = (index: number, pressed: boolean, painter: (x0: number, y0: number, ink: string) => void): void => {
    const x0 = widths.slice(0, index).reduce((a, b) => a + b, 0);
    const y0 = pressed ? 18 : 0;
    const w = widths[index] ?? 23;
    art.bevel(x0, y0, w, 18, pressed ? "#262a31" : FACE2, pressed ? LO : HI, pressed ? HI : LO);
    painter(x0 + (pressed ? 1 : 0), y0 + (pressed ? 1 : 0), TEXT);
  };
  const glyphs: readonly ((x: number, y: number, ink: string) => void)[] = [
    (x, y, ink) => {
      // prev |<<
      art.rect(x + 5, y + 5, 2, 8, ink);
      for (let i = 0; i < 4; i++) {
        art.rect(x + 12 - i, y + 5 + i, 2, 1, ink);
        art.rect(x + 12 - i, y + 12 - i, 2, 1, ink);
        art.rect(x + 17 - i, y + 5 + i, 2, 1, ink);
        art.rect(x + 17 - i, y + 12 - i, 2, 1, ink);
      }
    },
    (x, y, ink) => {
      // play >
      for (let i = 0; i < 5; i++) {
        art.rect(x + 8 + i, y + 4 + i, 1, 10 - i * 2, ink);
      }
    },
    (x, y, ink) => {
      // pause ||
      art.rect(x + 7, y + 5, 3, 8, ink);
      art.rect(x + 13, y + 5, 3, 8, ink);
    },
    (x, y, ink) => {
      // stop
      art.rect(x + 7, y + 5, 8, 8, ink);
    },
    (x, y, ink) => {
      // next >>|
      for (let i = 0; i < 4; i++) {
        art.rect(x + 4 + i, y + 5 + i, 2, 1, ink);
        art.rect(x + 4 + i, y + 12 - i, 2, 1, ink);
        art.rect(x + 9 + i, y + 5 + i, 2, 1, ink);
        art.rect(x + 9 + i, y + 12 - i, 2, 1, ink);
      }
      art.rect(x + 15, y + 5, 2, 8, ink);
    },
  ];
  glyphs.forEach((painter, i) => {
    draw(i, false, painter);
    draw(i, true, painter);
  });
  // eject 22x16 at (114, 0/16)
  for (const pressed of [false, true]) {
    const y0 = pressed ? 16 : 0;
    art.bevel(114, y0, 22, 16, pressed ? "#262a31" : FACE2, pressed ? LO : HI, pressed ? HI : LO);
    for (let i = 0; i < 4; i++) {
      art.rect(114 + 10 - i, y0 + 4 + i, 2 + i * 2, 1, TEXT);
    }
    art.rect(114 + 6, y0 + 10, 10, 2, TEXT);
  }
  return art;
}

function makeShufrep(): Art {
  const art = new Art(92, 85, FACE);
  const label = (x0: number, y0: number, w: number, text: string, lit: boolean, pressed: boolean): void => {
    art.bevel(x0, y0, w, 15, pressed ? "#262a31" : FACE2, pressed ? LO : HI, pressed ? HI : LO);
    const ink = lit ? GREEN : "#aab0bc";
    text.split("").forEach((c, i) => {
      drawGlyph(art, c, x0 + 4 + i * 6 + (pressed ? 1 : 0), y0 + 5 + (pressed ? 1 : 0), ink);
    });
    if (lit) {
      art.rect(x0 + 2, y0 + 2, 3, 3, GREEN);
    }
  };
  // repeat 28x15 col x=0; shuffle 47x15 col x=28; rows: 0 norm,15 pressed,30 lit,45 lit+pressed
  for (const [row, lit, pressed] of [
    [0, false, false],
    [15, false, true],
    [30, true, false],
    [45, true, true],
  ] as const) {
    label(0, row, 28, "rep", lit, pressed);
    label(28, row, 47, "shuffle", lit, pressed);
  }
  // eq/pl toggles 23x12: (0,61) eq unlit, (23,61) pl unlit; lit at y=73
  const small = (x0: number, y0: number, text: string, lit: boolean): void => {
    art.bevel(x0, y0, 23, 12, FACE2, HI, LO);
    text.split("").forEach((c, i) => {
      drawGlyph(art, c, x0 + 5 + i * 6, y0 + 3, lit ? GREEN : "#aab0bc");
    });
  };
  small(0, 61, "eq", false);
  small(23, 61, "pl", false);
  small(0, 73, "eq", true);
  small(23, 73, "pl", true);
  return art;
}

function makeVolume(balance: boolean): Art {
  const art = new Art(balance ? 47 : 68, 433, FACE);
  for (let f = 0; f < 28; f++) {
    const y0 = f * 15;
    const x0 = balance ? 9 : 0;
    const w = balance ? 38 : 68;
    art.rect(x0, y0, w, 13, "#20242a");
    art.rect(x0, y0 + 12, w, 1, HI);
    art.rect(x0, y0, w, 1, LO);
    const t = f / 27;
    if (balance) {
      const half = Math.round((w / 2 - 2) * t);
      const g = Math.round(0x60 + t * 0x80);
      const hex = `#${g.toString(16).padStart(2, "0")}40${(0xe0 - Math.round(t * 0x40)).toString(16).padStart(2, "0")}`;
      art.rect(x0 + w / 2 - half, y0 + 3, half, 7, hex);
      art.rect(x0 + w / 2, y0 + 3, half, 7, hex);
    } else {
      const fill = Math.round((w - 4) * t);
      const r = Math.round(0x20 + (1 - t) * 0x20);
      const g = Math.round(0x70 + t * 0x78);
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}30`;
      art.rect(x0 + 2, y0 + 3, fill, 7, hex);
    }
  }
  // thumbs at y=422: pressed (0,422), normal (15,422), 14x11
  for (const [tx, pressed] of [
    [0, true],
    [15, false],
  ] as const) {
    art.bevel(Number(tx), 422, 14, 11, pressed ? "#262a31" : "#4a505c", pressed ? LO : HI, pressed ? HI : LO);
    art.rect(Number(tx) + 6, 424, 2, 7, LO);
  }
  return art;
}

function makeMisc(): { monoster: Art; playpaus: Art; posbar: Art } {
  const monoster = new Art(56, 24, FACE);
  const lamp = (x0: number, y0: number, w: number, text: string, lit: boolean): void => {
    monoster.bevel(x0, y0, w, 12, lit ? "#1c2f1c" : "#23262c", HI, LO);
    text.split("").forEach((c, i) => {
      drawGlyph(monoster, c, x0 + 3 + i * 6, y0 + 3, lit ? GREEN : "#666c78");
    });
  };
  lamp(0, 0, 29, "mcp", true); // "stereo" slot
  lamp(0, 12, 29, "mcp", false);
  lamp(29, 0, 27, "sub", true); // "mono" slot
  lamp(29, 12, 27, "sub", false);

  const playpaus = new Art(42, 9, LCD);
  for (let i = 0; i < 4; i++) {
    playpaus.rect(1 + i, 2 + i, 1, 5 - i * 2 + (i === 3 ? 1 : 0), GREEN); // play
  }
  playpaus.rect(10, 1, 2, 7, GREEN); // pause
  playpaus.rect(14, 1, 2, 7, GREEN);
  playpaus.rect(19, 2, 6, 6, GREEN); // stop

  const posbar = new Art(307, 10, FACE);
  posbar.rect(0, 0, 248, 10, "#20242a");
  posbar.rect(0, 4, 248, 2, LO);
  for (const [tx, pressed] of [
    [248, false],
    [278, true],
  ] as const) {
    posbar.bevel(Number(tx), 0, 29, 10, pressed ? "#262a31" : "#4a505c", pressed ? LO : HI, pressed ? HI : LO);
    posbar.rect(Number(tx) + 13, 2, 3, 6, pressed ? HI : LO);
  }
  return { monoster, playpaus, posbar };
}

// ------------------------------------------------------------------ main

const { monoster, playpaus, posbar } = makeMisc();

const VISCOLOR = [
  "0,0,0 // background",
  "24,26,30 // grid dots",
  "255,70,70", // spectrum top
  "255,100,60",
  "255,130,50",
  "255,160,40",
  "255,190,40",
  "255,220,50",
  "230,235,60",
  "200,240,70",
  "160,240,80",
  "120,235,85",
  "90,230,90",
  "70,220,90",
  "50,210,85",
  "40,200,80",
  "30,190,75",
  "25,180,70", // spectrum bottom
  "60,255,100 // scope 1",
  "50,230,90",
  "40,205,80",
  "35,180,70",
  "30,155,60",
  "225,228,234 // peaks",
].join("\r\n");

const PLEDIT = [
  "[Text]",
  "Normal=#00C800",
  "Current=#FFFFFF",
  "NormalBG=#000000",
  "SelectedBG=#0000C6",
  "Font=Arial",
].join("\r\n");

const encoder = new TextEncoder();
const zip = zipSync({
  "main.bmp": makeMain().bmp(),
  "titlebar.bmp": makeTitlebar().bmp(),
  "cbuttons.bmp": makeCButtons().bmp(),
  "numbers.bmp": makeNumbers().bmp(),
  "text.bmp": makeTextSheet().bmp(),
  "shufrep.bmp": makeShufrep().bmp(),
  "volume.bmp": makeVolume(false).bmp(),
  "balance.bmp": makeVolume(true).bmp(),
  "monoster.bmp": monoster.bmp(),
  "playpaus.bmp": playpaus.bmp(),
  "posbar.bmp": posbar.bmp(),
  "viscolor.txt": encoder.encode(VISCOLOR),
  "pledit.txt": encoder.encode(PLEDIT),
  "readme.txt": encoder.encode(
    "grokamp-classic — original demo art for grokamp's .wsz pipeline.\r\nDrawn by scripts/make-demo-wsz.ts. No Winamp assets. Apache-2.0.\r\n",
  ),
});

await Bun.write(new URL("../src/assets/grokamp-classic.wsz", import.meta.url), zip);
await Bun.write(new URL("../docs/examples/grokamp-classic.wsz", import.meta.url), zip);
console.log(`grokamp-classic.wsz written (${zip.length} bytes)`);

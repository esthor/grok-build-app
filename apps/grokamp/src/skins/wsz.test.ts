import { describe, expect, test } from "bun:test";
import { parsePledit, parseViscolor, pickEntry } from "./wsz";

describe("pickEntry", () => {
  const a = new Uint8Array([1]);
  const b = new Uint8Array([2]);

  test("matches case-insensitively and ignores directories", () => {
    const files = { "Skin/MAIN.BMP": a };
    expect(pickEntry(files, "main.bmp")).toBe(a);
  });

  test("last duplicate wins, like windows unzip did", () => {
    const files = { "main.bmp": a, "nested/Main.Bmp": b };
    expect(pickEntry(files, "main.bmp")).toBe(b);
  });

  test("misses return null", () => {
    expect(pickEntry({ "eqmain.bmp": a }, "main.bmp")).toBeNull();
  });

  test("handles backslash paths", () => {
    const files = { "skin\\titlebar.bmp": a };
    expect(pickEntry(files, "titlebar.bmp")).toBe(a);
  });
});

describe("parseViscolor", () => {
  test("parses 24 R,G,B lines with trailing junk", () => {
    const lines = Array.from({ length: 24 }, (_, i) => `${i},${i * 2},${i * 3} // comment ${i}`);
    const colors = parseViscolor(lines.join("\r\n"));
    expect(colors).toHaveLength(24);
    expect(colors?.[0]).toBe("#000000");
    expect(colors?.[2]).toBe("#020406");
  });

  test("pads short palettes by repeating the last color", () => {
    const colors = parseViscolor("0,0,0\n255,0,0");
    expect(colors).toHaveLength(24);
    expect(colors?.[23]).toBe("#ff0000");
  });

  test("clamps out-of-range components", () => {
    const colors = parseViscolor(Array.from({ length: 24 }, () => "999,0,0").join("\n"));
    expect(colors?.[0]).toBe("#ff0000");
  });

  test("returns null for garbage", () => {
    expect(parseViscolor("hello\nworld")).toBeNull();
  });
});

describe("parsePledit", () => {
  test("reads the classic [Text] keys and normalizes #", () => {
    const pledit = parsePledit(
      "[Text]\r\nNormal=#00C800\r\nCurrent=FFFFFF\r\nNormalBG=#000000\r\nSelectedBG=#0000C6\r\nFont=Arial",
    );
    expect(pledit).toEqual({
      normal: "#00c800",
      current: "#ffffff",
      normalBg: "#000000",
      selectedBg: "#0000c6",
    });
  });

  test("fills defaults for missing keys", () => {
    const pledit = parsePledit("[Text]\nNormal=#123456");
    expect(pledit?.normal).toBe("#123456");
    expect(pledit?.current).toBe("#ffffff");
  });

  test("returns null when nothing parses", () => {
    expect(parsePledit("[Text]\nFont=Arial")).toBeNull();
  });

  test("truncates overlong values to 7 chars", () => {
    expect(parsePledit("Normal=#AABBCCDD")?.normal).toBe("#aabbcc");
  });
});

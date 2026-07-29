import { describe, expect, test } from "bun:test";
import { BUILTIN_SKINS } from "./builtins";
import { ramp } from "./ramp";
import { parseSkin } from "./runtime";
import { SKIN_COLOR_KEYS } from "./types";

function validSkinJson(): Record<string, unknown> {
  const base = BUILTIN_SKINS[0];
  if (base === undefined) {
    throw new Error("no builtins");
  }
  return { name: "Test Skin", colors: { ...base.colors } };
}

describe("parseSkin", () => {
  test("accepts a minimal skin and synthesizes a 24-slot vis palette", () => {
    const result = parseSkin(validSkinJson());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skin.name).toBe("Test Skin");
      expect(result.skin.vis).toHaveLength(24);
    }
  });

  test("rejects a missing color key", () => {
    const json = validSkinJson();
    const colors = json["colors"] as Record<string, unknown>;
    delete colors["lcdText"];
    const result = parseSkin(json);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("lcdText");
    }
  });

  test("rejects non-hex colors", () => {
    const json = validSkinJson();
    (json["colors"] as Record<string, unknown>)["chrome"] = "sparkly";
    expect(parseSkin(json).ok).toBe(false);
  });

  test("rejects a nameless skin", () => {
    const json = validSkinJson();
    json["name"] = "";
    expect(parseSkin(json).ok).toBe(false);
  });

  test("rejects out-of-range radius", () => {
    const json = validSkinJson();
    json["radius"] = 99;
    expect(parseSkin(json).ok).toBe(false);
  });

  test("accepts an explicit vis palette of exactly 24 colors", () => {
    const json = validSkinJson();
    const palette = Array.from({ length: 24 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`);
    json["vis"] = palette;
    const result = parseSkin(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skin.vis).toEqual(palette);
    }
  });

  test("rejects a partial vis palette (viscolor.txt was exactly 24 lines)", () => {
    const json = validSkinJson();
    json["vis"] = ["#000000", "#111111", "#ff0000"];
    const result = parseSkin(json);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("24");
    }
  });

  test("rejects alpha hex colors (synthesis would silently drop alpha)", () => {
    const json = validSkinJson();
    (json["colors"] as Record<string, unknown>)["chrome"] = "#11223344";
    expect(parseSkin(json).ok).toBe(false);
  });

  test("round-trips every builtin skin", () => {
    for (const skin of BUILTIN_SKINS) {
      const result = parseSkin(JSON.parse(JSON.stringify(skin)) as unknown);
      expect(result.ok).toBe(true);
    }
  });
});

describe("builtins", () => {
  test("every builtin has all color keys and a full vis palette", () => {
    for (const skin of BUILTIN_SKINS) {
      for (const key of SKIN_COLOR_KEYS) {
        expect(skin.colors[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      expect(skin.vis).toHaveLength(24);
      for (const color of skin.vis) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe("ramp", () => {
  test("interpolates to the requested count", () => {
    const colors = ramp(["#000000", "#ffffff"], 16);
    expect(colors).toHaveLength(16);
    expect(colors[0]).toBe("#000000");
    expect(colors[15]).toBe("#ffffff");
  });

  test("single stop repeats", () => {
    expect(ramp(["#123456"], 3)).toEqual(["#123456", "#123456", "#123456"]);
  });
});

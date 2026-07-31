import { describe, expect, test } from "bun:test";
import { decodeNodes, displayName, filterSafe, museumPageUrl } from "./museum";

describe("decodeNodes", () => {
  test("keeps well-formed classic skin nodes", () => {
    const nodes = [
      {
        md5: "abc123",
        filename: "Cool_Skin.wsz",
        nsfw: false,
        download_url: "https://r2.webampskins.org/skins/abc123.wsz",
      },
    ];
    const decoded = decodeNodes(nodes);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.downloadUrl).toContain("abc123");
  });

  test("drops malformed nodes (modern skins have no download shape here)", () => {
    const decoded = decodeNodes([
      null,
      {},
      { md5: "x", filename: "y.wsz" }, // missing download_url
      { md5: 1, filename: "z.wsz", download_url: "u" },
    ]);
    expect(decoded).toHaveLength(0);
  });

  test("nsfw defaults to false only on explicit boolean", () => {
    const decoded = decodeNodes([
      { md5: "a", filename: "a.wsz", nsfw: true, download_url: "u" },
      { md5: "b", filename: "b.wsz", nsfw: "yes", download_url: "u" },
    ]);
    expect(decoded[0]?.nsfw).toBe(true);
    expect(decoded[1]?.nsfw).toBe(false);
  });
});

describe("filterSafe", () => {
  test("filters nsfw entries out", () => {
    const skins = decodeNodes([
      { md5: "a", filename: "a.wsz", nsfw: true, download_url: "u" },
      { md5: "b", filename: "b.wsz", nsfw: false, download_url: "u" },
    ]);
    expect(filterSafe(skins).map((s) => s.md5)).toEqual(["b"]);
  });
});

describe("displayName", () => {
  test("strips extension and underscores", () => {
    expect(displayName("Zelda_Amp_3.wsz")).toBe("Zelda Amp 3");
    expect(displayName("base-2.91.wsz")).toBe("base-2.91");
  });
});

describe("museumPageUrl", () => {
  test("links to the museum skin page", () => {
    expect(museumPageUrl("deadbeef")).toBe("https://skins.webamp.org/skin/deadbeef");
  });
});

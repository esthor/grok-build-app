import { useStore } from "@tanstack/react-store";
import { useRef, useState, type ReactNode } from "react";
import demoWszUrl from "../assets/grokamp-classic.wsz?url";
import { BUILTIN_SKINS } from "../skins/builtins";
import { buildVis, lerpHex } from "../skins/ramp";
import { parseSkin, skinToJson } from "../skins/runtime";
import type { Skin, SkinColors } from "../skins/types";
import { SKIN_COLOR_KEYS } from "../skins/types";
import { forgetWsz, wearWsz } from "../skins/wsz";
import { pushLog } from "../state/session";
import {
  allSkins,
  currentSkin,
  removeCustomSkin,
  setSkin,
  settingsStore,
  upsertCustomSkin,
} from "../state/settings";
import { setWindowOpen } from "../state/windows";
import { LcdText, SquareBtn } from "../ui/controls";

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomSkin(): Skin {
  const h = Math.floor(Math.random() * 360);
  const h2 = (h + 40 + Math.floor(Math.random() * 80)) % 360;
  const dark = Math.random() > 0.25;
  const chromeL = dark ? 24 : 78;
  const colors: SkinColors = {
    desktop: hslToHex(h, 30, dark ? 8 : 62),
    chrome: hslToHex(h, 22, chromeL),
    chromeDeep: hslToHex(h, 26, dark ? 14 : 64),
    edgeLight: hslToHex(h, 24, dark ? 44 : 94),
    edgeDark: hslToHex(h, 30, dark ? 6 : 40),
    titleA: hslToHex(h2, 70, dark ? 22 : 55),
    titleB: hslToHex(h2, 85, dark ? 45 : 72),
    titleText: dark ? "#ffffff" : hslToHex(h2, 80, 12),
    titleTextDim: hslToHex(h, 15, dark ? 55 : 35),
    lcdBg: hslToHex(h, 45, dark ? 5 : 10),
    lcdText: hslToHex(h2, 95, 60),
    lcdDim: hslToHex(h2, 60, 30),
    lcdAccent: hslToHex(h2, 100, 78),
    btnFace: hslToHex(h, 20, dark ? 30 : 72),
    btnText: dark ? "#f2f2f2" : hslToHex(h, 40, 14),
    sliderTrack: hslToHex(h, 30, dark ? 10 : 55),
    sliderThumb: hslToHex(h2, 45, dark ? 55 : 45),
    listBg: hslToHex(h, 45, dark ? 6 : 95),
    listText: hslToHex(h2, 70, dark ? 62 : 30),
    listCurrent: dark ? "#ffffff" : "#000000",
    listSelBg: hslToHex(h2, 55, dark ? 24 : 80),
    ok: "#4ade80",
    warn: "#fbbf24",
    err: "#f87171",
    ledOff: hslToHex(h, 15, dark ? 16 : 60),
  };
  return {
    name: `Random ${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    author: "skin lab",
    colors,
    vis: buildVis({
      bg: colors.lcdBg,
      grid: lerpHex(colors.lcdBg, colors.lcdDim, 0.3),
      spectrum: [colors.lcdAccent, colors.lcdText, colors.lcdDim],
      scope: [colors.lcdText, colors.lcdDim, colors.lcdDim],
      peak: colors.lcdAccent,
    }),
    radius: 0,
  };
}

const LABELS: Partial<Record<keyof SkinColors, string>> = {
  desktop: "desk",
  chrome: "chrome",
  chromeDeep: "deep",
  edgeLight: "edge+",
  edgeDark: "edge-",
  titleA: "titleA",
  titleB: "titleB",
  titleText: "title",
  titleTextDim: "t.dim",
  lcdBg: "lcd bg",
  lcdText: "lcd",
  lcdDim: "lcd dim",
  lcdAccent: "accent",
  btnFace: "btn",
  btnText: "btn txt",
  sliderTrack: "track",
  sliderThumb: "thumb",
  listBg: "list bg",
  listText: "list",
  listCurrent: "current",
  listSelBg: "select",
  ok: "ok",
  warn: "warn",
  err: "err",
  ledOff: "led off",
};

export function SkinLabTile(): ReactNode {
  const skinName = useStore(settingsStore, (s) => s.skinName);
  const customCount = useStore(settingsStore, (s) => s.customSkins.length);
  const customSkins = useStore(settingsStore, (s) => s.customSkins);
  const [draft, setDraft] = useState<Skin>(() => currentSkin());
  // an imported/authored vis palette is data we must not clobber; only
  // re-synthesize it after the user actually repaints colors
  const [colorsDirty, setColorsDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applyDraft = (): void => {
    const builtinNames = BUILTIN_SKINS.map((s) => s.name);
    const name = builtinNames.includes(draft.name) ? `${draft.name} MOD` : draft.name;
    const skin: Skin = {
      ...draft,
      name,
      vis: colorsDirty
        ? buildVis({
            bg: draft.colors.lcdBg,
            grid: lerpHex(draft.colors.lcdBg, draft.colors.lcdDim, 0.3),
            spectrum: [draft.colors.lcdAccent, draft.colors.lcdText, draft.colors.lcdDim],
            scope: [draft.colors.lcdText, draft.colors.lcdDim, draft.colors.lcdDim],
            peak: draft.colors.lcdAccent,
          })
        : draft.vis,
    };
    setDraft(skin);
    setColorsDirty(false);
    upsertCustomSkin(skin);
    pushLog("sys", `skin applied: ${skin.name}`);
  };

  const exportDraft = (): void => {
    const blob = new Blob([skinToJson(draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.grokskin.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushLog("sys", `skin exported: ${a.download}`);
  };

  const importFile = async (file: File): Promise<void> => {
    if (/\.(wsz|zip)$/i.test(file.name)) {
      await wearWsz(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.(wsz|zip)$/i, ""));
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = parseSkin(parsed);
      if (result.ok) {
        setDraft(result.skin);
        setColorsDirty(false);
        upsertCustomSkin(result.skin);
        pushLog("sys", `skin imported: ${result.skin.name}`, "ok");
      } else {
        pushLog("sys", `skin rejected: ${result.error}`, "err");
      }
    } catch {
      pushLog("sys", "skin rejected: not valid JSON", "err");
    }
  };

  return (
    <div className="skinlab-tile">
      <div className="skinlab-row">
        <select
          className="tuner-preset skinlab-picker"
          title="installed skins"
          value={skinName}
          onChange={(e) => {
            setSkin(e.target.value);
            setDraft(currentSkin());
            setColorsDirty(false);
          }}
        >
          {allSkins().map((s) => (
            <option key={`${s.name}-${customCount}`} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className="skinlab-name"
          value={draft.name}
          title="draft skin name"
          onChange={(e) => {
            setDraft((d) => ({ ...d, name: e.target.value }));
          }}
        />
      </div>

      <div className="skinlab-grid">
        {SKIN_COLOR_KEYS.map((key) => (
          <label className="skinlab-swatch" key={key} title={key}>
            <input
              type="color"
              value={draft.colors[key]}
              onChange={(e) => {
                const value = e.target.value;
                setColorsDirty(true);
                setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));
              }}
            />
            <span>{LABELS[key] ?? key}</span>
          </label>
        ))}
      </div>

      <div className="skinlab-row skinlab-actions">
        <SquareBtn title="apply draft as a custom skin" onClick={applyDraft}>
          APPLY
        </SquareBtn>
        <SquareBtn title="download draft as .grokskin.json" onClick={exportDraft}>
          EXPORT
        </SquareBtn>
        <SquareBtn
          title="import a .grokskin.json"
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          IMPORT
        </SquareBtn>
        <SquareBtn
          title="roll a random skin"
          onClick={() => {
            const skin = randomSkin();
            setDraft(skin);
            setColorsDirty(false);
            upsertCustomSkin(skin);
          }}
        >
          RANDOM
        </SquareBtn>
        <SquareBtn
          title="delete this custom skin (builtins are forever)"
          disabled={!customSkins.some((c) => c.name === skinName)}
          onClick={() => {
            if (removeCustomSkin(skinName)) {
              pushLog("sys", `skin deleted: ${skinName}`);
              setDraft(currentSkin());
              setColorsDirty(false);
            }
          }}
        >
          DEL
        </SquareBtn>
      </div>
      <div className="skinlab-row skinlab-actions">
        <SquareBtn
          title="wear a classic winamp .wsz you supply (pixel-perfect head unit)"
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          WEAR .WSZ
        </SquareBtn>
        <SquareBtn
          title="wear the bundled original-art demo .wsz"
          onClick={() => {
            void (async () => {
              const res = await fetch(demoWszUrl);
              await wearWsz(new Uint8Array(await res.arrayBuffer()), "grokamp-classic");
            })();
          }}
        >
          DEMO
        </SquareBtn>
        <SquareBtn
          title="take the .wsz off"
          onClick={() => {
            forgetWsz();
            setWindowOpen("head", false);
            pushLog("sys", "wsz ejected");
          }}
        >
          EJECT
        </SquareBtn>
        <SquareBtn
          title="browse the winamp skin museum (100k+ skins)"
          onClick={() => {
            setWindowOpen("museum", true);
          }}
        >
          MUSEUM
        </SquareBtn>
      </div>
      <div className="skinlab-hint">
        <LcdText dim>skins are JSON or classic .wsz — docs/SKINNING.md</LcdText>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,.wsz,.zip,application/zip"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file !== undefined) {
            void importFile(file);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

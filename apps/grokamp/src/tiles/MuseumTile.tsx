import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  browseMuseum,
  displayName,
  downloadSkin,
  searchMuseum,
  type MuseumSkin,
} from "../skins/museum";
import { previewWsz, wearWsz } from "../skins/wsz";
import { pushLog } from "../state/session";
import { LcdText, SquareBtn } from "../ui/controls";

/**
 * The Winamp Skin Museum (skins.webamp.org) as a first-class skin source.
 * Selecting a row (click or ↑/↓) previews the skin in-app — the head unit
 * wears it temporarily. Enter or WEAR commits it (persists). Skins stream
 * on demand from the museum's public API; none are bundled.
 */
export function MuseumTile(): ReactNode {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(-1);
  const [busyMd5, setBusyMd5] = useState<string | null>(null);
  const bytesCache = useRef(new Map<string, Uint8Array>());
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useQuery({
    queryKey: ["museum", query],
    queryFn: async () => (query.length > 0 ? searchMuseum(query) : browseMuseum(0)),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const skins = results.data ?? [];

  useEffect(() => {
    return () => {
      if (previewTimer.current !== null) {
        clearTimeout(previewTimer.current);
      }
    };
  }, []);

  const ensureBytes = async (skin: MuseumSkin): Promise<Uint8Array> => {
    const cached = bytesCache.current.get(skin.md5);
    if (cached !== undefined) {
      return cached;
    }
    const bytes = await downloadSkin(skin);
    bytesCache.current.set(skin.md5, bytes);
    return bytes;
  };

  /** select a row and (debounced) preview it — arrows can flick through fast */
  const select = (index: number): void => {
    const skin = skins[index];
    if (skin === undefined) {
      return;
    }
    setSelected(index);
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
    if (previewTimer.current !== null) {
      clearTimeout(previewTimer.current);
    }
    previewTimer.current = setTimeout(() => {
      void (async () => {
        setBusyMd5(skin.md5);
        try {
          const ok = await previewWsz(await ensureBytes(skin), displayName(skin.filename));
          if (!ok) {
            pushLog("sys", `preview failed: ${displayName(skin.filename)}`, "warn");
          }
        } catch {
          pushLog("sys", `museum download failed: ${displayName(skin.filename)}`, "err");
        } finally {
          setBusyMd5(null);
        }
      })();
    }, 280);
  };

  const commit = async (skin: MuseumSkin): Promise<void> => {
    setBusyMd5(skin.md5);
    try {
      await wearWsz(await ensureBytes(skin), displayName(skin.filename));
    } catch {
      pushLog("sys", `museum download failed: ${displayName(skin.filename)}`, "err");
    } finally {
      setBusyMd5(null);
    }
  };

  const onListKeys = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      select(Math.max(0, Math.min(skins.length - 1, selected + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && skins[selected] !== undefined) {
      e.preventDefault();
      void commit(skins[selected]);
    }
  };

  return (
    <div className="museum-tile">
      <div className="skinlab-row">
        <input
          className="skinlab-name"
          value={input}
          placeholder="search 100k+ classic skins…"
          title="search the winamp skin museum"
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown") {
              setQuery(input.trim());
              setSelected(-1);
              listRef.current?.focus();
            }
          }}
        />
        <SquareBtn
          title="search the museum"
          onClick={() => {
            setQuery(input.trim());
            setSelected(-1);
          }}
        >
          FIND
        </SquareBtn>
      </div>

      <div
        className="museum-list lcd"
        ref={listRef}
        tabIndex={0}
        role="listbox"
        aria-label="museum skins — arrows preview, enter wears"
        onKeyDown={onListKeys}
      >
        {results.isPending ? (
          <div className="queue-empty">
            <LcdText accent>DIALING THE MUSEUM…</LcdText>
          </div>
        ) : results.isError ? (
          <div className="queue-empty">
            <LcdText dim>museum unreachable — check network, retry with FIND</LcdText>
          </div>
        ) : skins.length === 0 ? (
          <div className="queue-empty">
            <LcdText dim>no hits — try another search</LcdText>
          </div>
        ) : (
          skins.map((skin, index) => (
            <div
              className="museum-row"
              key={skin.md5}
              data-index={index}
              data-selected={index === selected ? "yes" : "no"}
              role="option"
              aria-selected={index === selected}
              onClick={() => {
                select(index);
              }}
              onDoubleClick={() => {
                void commit(skin);
              }}
            >
              <span className="museum-name" title={skin.filename}>
                {busyMd5 === skin.md5 ? "⋯ " : ""}
                {displayName(skin.filename)}
              </span>
              <SquareBtn
                title="keep this skin (persists)"
                disabled={busyMd5 !== null}
                onClick={() => {
                  void commit(skin);
                }}
              >
                WEAR
              </SquareBtn>
            </div>
          ))
        )}
      </div>

      <div className="skinlab-hint">
        <LcdText dim>
          ↑/↓ preview in-app · ENTER or WEAR keeps it · data: Winamp Skin Museum
        </LcdText>
      </div>
    </div>
  );
}

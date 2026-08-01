import { useInfiniteQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
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
 * The Winamp Skin Museum as a first-class source: most-popular-first (the
 * museum's own curated `sort: MUSEUM` order), 100 per page, infinite scroll
 * through all ~102k, and search across the whole archive. Selecting a row
 * (click or ↑/↓) previews it in-app; ENTER or WEAR keeps it.
 */
export function MuseumTile(): ReactNode {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(-1);
  const [busyMd5, setBusyMd5] = useState<string | null>(null);
  const bytesCache = useRef(new Map<string, Uint8Array>());
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const pages = useInfiniteQuery({
    queryKey: ["museum", query],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      query.length > 0 ? searchMuseum(query, pageParam) : browseMuseum(pageParam),
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const skins = pages.data?.pages.flatMap((page) => page.skins) ?? [];
  const total = pages.data?.pages[0]?.total ?? null;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;

  useEffect(() => {
    return () => {
      if (previewTimer.current !== null) {
        clearTimeout(previewTimer.current);
      }
    };
  }, []);

  /**
   * Infinite scroll driven by scroll position rather than
   * IntersectionObserver: IO geometry is unreliable inside a nested scroller
   * that can also be `zoom`-scaled (double-size mode), and a threshold check
   * is trivially testable. 600px of runway keeps loading ahead of the eye.
   */
  const pullMoreIfNeeded = useCallback(
    (el: HTMLDivElement): void => {
      if (!hasNextPage || isFetchingNextPage) {
        return;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) {
        void fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  // a short list may not fill its pane; top up until it can scroll at all
  useEffect(() => {
    const el = listRef.current;
    if (el !== null && el.scrollHeight <= el.clientHeight) {
      pullMoreIfNeeded(el);
    }
  }, [pullMoreIfNeeded, skins.length]);

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
      const next = Math.max(
        0,
        Math.min(skins.length - 1, selected + (e.key === "ArrowDown" ? 1 : -1)),
      );
      select(next);
      // arrowing toward the tail pulls the next page in before you get there
      if (next > skins.length - 12 && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
      return;
    }
    const current = skins[selected];
    if (e.key === "Enter" && current !== undefined) {
      e.preventDefault();
      void commit(current);
    }
  };

  const runSearch = (): void => {
    setQuery(input.trim());
    setSelected(-1);
  };

  return (
    <div className="museum-tile">
      <div className="skinlab-row">
        <input
          className="skinlab-name"
          value={input}
          placeholder="search all 102k classic skins…"
          title="search the winamp skin museum"
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              runSearch();
              listRef.current?.focus();
            }
          }}
        />
        <SquareBtn title="search the museum" onClick={runSearch}>
          FIND
        </SquareBtn>
        {query.length > 0 && (
          <SquareBtn
            title="back to most popular"
            onClick={() => {
              setInput("");
              setQuery("");
              setSelected(-1);
            }}
          >
            TOP
          </SquareBtn>
        )}
      </div>

      <div
        className="museum-list lcd"
        ref={listRef}
        tabIndex={0}
        role="listbox"
        aria-label="museum skins — arrows preview, enter wears"
        onKeyDown={onListKeys}
        onScroll={(e) => {
          pullMoreIfNeeded(e.currentTarget);
        }}
      >
        {pages.isPending ? (
          <div className="queue-empty">
            <LcdText accent>DIALING THE MUSEUM…</LcdText>
          </div>
        ) : pages.isError ? (
          <div className="queue-empty">
            <LcdText dim>museum unreachable — check network, retry with FIND</LcdText>
          </div>
        ) : skins.length === 0 ? (
          <div className="queue-empty">
            <LcdText dim>no hits — try another search</LcdText>
          </div>
        ) : (
          <>
            {skins.map((skin, index) => (
              <div
                className="museum-row"
                key={`${skin.md5}-${index}`}
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
                <span className="museum-rank">{index + 1}</span>
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
            ))}
            <div className="museum-sentinel">
              {isFetchingNextPage ? (
                <LcdText accent>LOADING MORE…</LcdText>
              ) : hasNextPage ? (
                <LcdText dim>scroll for more</LcdText>
              ) : (
                <LcdText dim>end of the archive</LcdText>
              )}
            </div>
          </>
        )}
      </div>

      <div className="skinlab-hint">
        <LcdText dim>
          {skins.length > 0
            ? `${skins.length}${total !== null ? ` / ${total.toLocaleString()}` : ""} · ${
                query.length > 0 ? "search" : "most popular"
              } · ↑/↓ preview · ENTER keeps`
            : "↑/↓ preview in-app · ENTER or WEAR keeps it"}
        </LcdText>
      </div>
    </div>
  );
}

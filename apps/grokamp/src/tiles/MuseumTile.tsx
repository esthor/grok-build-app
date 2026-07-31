import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  browseMuseum,
  displayName,
  downloadSkin,
  museumPageUrl,
  type MuseumSkin,
} from "../skins/museum";
import { wearWsz } from "../skins/wsz";
import { pushLog } from "../state/session";
import { LcdText, SquareBtn } from "../ui/controls";

/**
 * The Winamp Skin Museum (skins.webamp.org) as a first-class skin source:
 * search 100k+ archived classic skins, hit WEAR, and the head unit dresses
 * itself. Skins stream on demand from the museum's public API — none are
 * bundled here.
 */
export function MuseumTile(): ReactNode {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [wearing, setWearing] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ["museum", query],
    queryFn: async () => {
      const { searchMuseum } = await import("../skins/museum");
      return query.length > 0 ? searchMuseum(query) : browseMuseum(0);
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const wear = async (skin: MuseumSkin): Promise<void> => {
    setWearing(skin.md5);
    try {
      const bytes = await downloadSkin(skin);
      await wearWsz(bytes, displayName(skin.filename));
    } catch {
      pushLog("sys", `museum download failed: ${displayName(skin.filename)}`, "err");
    } finally {
      setWearing(null);
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
            if (e.key === "Enter") {
              setQuery(input.trim());
            }
          }}
        />
        <SquareBtn
          title="search the museum"
          onClick={() => {
            setQuery(input.trim());
          }}
        >
          FIND
        </SquareBtn>
      </div>

      <div className="museum-list lcd">
        {results.isPending ? (
          <div className="queue-empty">
            <LcdText accent>DIALING THE MUSEUM…</LcdText>
          </div>
        ) : results.isError ? (
          <div className="queue-empty">
            <LcdText dim>museum unreachable — check network, retry with FIND</LcdText>
          </div>
        ) : results.data.length === 0 ? (
          <div className="queue-empty">
            <LcdText dim>no hits — try another search</LcdText>
          </div>
        ) : (
          results.data.map((skin) => (
            <div className="museum-row" key={skin.md5}>
              <a
                className="museum-name"
                href={museumPageUrl(skin.md5)}
                target="_blank"
                rel="noreferrer"
                title="open in the skin museum"
              >
                {displayName(skin.filename)}
              </a>
              <SquareBtn
                title="wear this skin"
                disabled={wearing !== null}
                onClick={() => {
                  void wear(skin);
                }}
              >
                {wearing === skin.md5 ? "…" : "WEAR"}
              </SquareBtn>
            </div>
          ))
        )}
      </div>

      <div className="skinlab-hint">
        <LcdText dim>data: Winamp Skin Museum · skins stream on demand, uncommitted</LcdText>
      </div>
    </div>
  );
}

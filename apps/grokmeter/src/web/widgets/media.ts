// NOW PLAYING — track readout, progress, and decorative level bars.

import { clamp, cssVar, el, fmtClock, frameCanvas } from "../lib.ts";
import type { WidgetDef } from "../widget.ts";

const BARS = 42;

export const mediaWidget: WidgetDef = {
  id: "media",
  label: "NOW PLAYING",
  col: 1,
  order: 3,
  h: 120,
  mount({ store, body, setStatus }) {
    const track = el("div", "", "no signal");
    track.style.fontSize = "13px";
    track.style.overflow = "hidden";
    track.style.textOverflow = "ellipsis";
    track.style.whiteSpace = "nowrap";
    const artist = el("div", "micro", "");
    artist.style.marginTop = "2px";

    const viz = document.createElement("canvas");
    viz.style.width = "100%";
    viz.style.height = "26px";
    viz.style.display = "block";
    viz.style.marginTop = "7px";

    const progress = el("div", "bar-track");
    progress.style.marginTop = "7px";
    const fill = el("div", "bar-fill");
    progress.append(fill);
    const times = el("div");
    times.style.display = "flex";
    times.style.justifyContent = "space-between";
    times.style.marginTop = "3px";
    const pos = el("span", "micro", "0:00");
    const dur = el("span", "micro", "0:00");
    times.append(pos, dur);

    body.append(track, artist, viz, progress, times);

    let playing = false;
    store.on("media", (media) => {
      if (media === null) {
        track.textContent = "no signal";
        artist.textContent = "";
        playing = false;
        setStatus("");
        return;
      }
      playing = media.state === "playing";
      track.textContent = media.track;
      artist.textContent = `${media.artist.toUpperCase()} — ${media.album.toUpperCase()} · ${media.player.toUpperCase()}`;
      fill.style.width = `${clamp((media.positionSec / Math.max(1, media.durationSec)) * 100, 0, 100)}%`;
      pos.textContent = fmtClock(media.positionSec);
      dur.textContent = fmtClock(media.durationSec);
      setStatus(playing ? "run" : "");
    });

    const tick = (now: number): void => {
      const ctx = frameCanvas(viz);
      if (ctx === null) return;
      const w = viz.clientWidth;
      const h = viz.clientHeight;
      const t = now / 1000;
      const bw = w / BARS;
      const color = cssVar("--accent");
      ctx.fillStyle = color;
      for (let i = 0; i < BARS; i += 1) {
        const energy = playing
          ? 0.12 +
            0.62 *
              Math.abs(
                Math.sin(t * 2.1 + i * 0.9) * Math.sin(t * 3.7 + i * 0.33) * Math.sin(t * 0.9 + i),
              )
          : 0.05;
        const bh = Math.max(1, energy * h);
        ctx.globalAlpha = 0.25 + energy * 0.6;
        ctx.fillRect(i * bw + 0.5, h - bh, bw - 1.5, bh);
      }
      ctx.globalAlpha = 1;
    };

    return { tick };
  },
};

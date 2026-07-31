// NOW PLAYING via AppleScript — Spotify first, then Music. Fails silent:
// if neither is running (or automation permission is denied) the widget
// simply shows no signal.

import type { CollectorEmit } from "../shared/protocol.ts";

type Emit = Pick<CollectorEmit, "media">;

async function osascript(script: string): Promise<string> {
  try {
    const proc = Bun.spawn(["osascript", "-e", script], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const timeout = setTimeout(() => proc.kill(), 1500);
    const out = await proc.stdout.text();
    await proc.exited;
    clearTimeout(timeout);
    return out.trim();
  } catch {
    return "";
  }
}

const SEP = "";

function queryApp(app: "Spotify" | "Music"): string {
  return `
    if application "${app}" is running then
      tell application "${app}"
        if player state is playing or player state is paused then
          set sep to (ASCII character 31)
          return (player state as text) & sep & (name of current track) & sep & (artist of current track) & sep & (album of current track) & sep & (player position as text) & sep & (duration of current track as text)
        end if
      end tell
    end if
    return ""`;
}

export function startMedia(emit: Emit): void {
  const sample = async (): Promise<void> => {
    for (const app of ["Spotify", "Music"] as const) {
      const out = await osascript(queryApp(app));
      if (out === "") continue;
      const parts = out.split(SEP);
      if (parts.length !== 6) continue;
      const [stateRaw, track, artist, album, posRaw, durRaw] = parts;
      if (
        stateRaw === undefined ||
        track === undefined ||
        artist === undefined ||
        album === undefined ||
        posRaw === undefined ||
        durRaw === undefined
      ) {
        continue;
      }
      // Honest data: malformed timing means this player's answer is
      // unusable — skip it rather than fabricate zeros.
      const pos = Number(posRaw.replace(",", "."));
      const dur = Number(durRaw.replace(",", "."));
      if (!Number.isFinite(pos) || !Number.isFinite(dur) || pos < 0 || dur < 0) continue;
      emit.media({
        player: app,
        state: stateRaw === "playing" ? "playing" : "paused",
        track,
        artist,
        album,
        positionSec: pos,
        // Spotify reports duration in ms; Music in seconds.
        durationSec: app === "Spotify" ? dur / 1000 : dur,
      });
      return;
    }
    emit.media(null);
  };
  void sample();
  setInterval(() => void sample(), 3000);
}

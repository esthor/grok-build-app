import { useStore } from "@tanstack/react-store";
import { useEffect, useState, type ReactNode } from "react";
import {
  addRandomTask,
  advance,
  pauseToggle,
  play,
  stop,
  whipTheLlama,
} from "./agent/controller";
import { toggleRepeat, toggleShuffle } from "./state/queue";
import { settingsStore, updateSettings } from "./state/settings";
import { toggleWindow, WIN_IDS } from "./state/windows";
import { WINDOW_DEFS } from "./tiles/registry";
import { Win } from "./wm/Window";

function AboutOverlay({ onClose }: { readonly onClose: () => void }): ReactNode {
  return (
    <div className="about-backdrop" onClick={onClose} role="presentation">
      <div className="about-box bevel-out">
        <div className="about-title">GROKAMP 0.1</div>
        <div className="about-body">
          <p>a winamp-shaped frontend for grok-build.</p>
          <p>
            windows snap at 10 (classic) pixels. skins are one JSON file. the
            playlist is a task queue. the EQ tunes the harness. the visualizer
            eats tokens.
          </p>
          <p className="about-credits">
            bun · vite · react · tanstack router/store/virtual/query
            <br />
            protocol shaped for grok-build&apos;s ACP (agent stdio)
            <br />
            built in a coding-agent harness, for coding-agent harnesses
          </p>
          <p className="about-llama">
            type <b>llama</b> anywhere. it really whips it.
          </p>
        </div>
        <button type="button" className="sq-btn" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function App(): ReactNode {
  const doubleSize = useStore(settingsStore, (s) => s.doubleSize);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let llamaBuffer = "";
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        updateSettings({ doubleSize: !settingsStore.state.doubleSize });
        return;
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const id = WIN_IDS[Number.parseInt(e.key, 10) - 1];
        if (id !== undefined) {
          e.preventDefault();
          toggleWindow(id);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const key = e.key.toLowerCase();
      if (/^[a-z]$/.test(key)) {
        llamaBuffer = (llamaBuffer + key).slice(-5);
        if (llamaBuffer === "llama") {
          whipTheLlama();
          llamaBuffer = "";
          return;
        }
      }
      // the sacred winamp row: Z X C V B
      switch (key) {
        case "z":
          advance(-1, false);
          break;
        case "x":
          play();
          break;
        case "c":
          pauseToggle();
          break;
        case "v":
          stop();
          break;
        case "b":
          advance(1, false);
          break;
        case "s":
          toggleShuffle();
          break;
        case "r":
          toggleRepeat();
          break;
        case "l":
          addRandomTask();
          break;
        case "escape":
          setAboutOpen(false);
          break;
      }
    };
    const onAbout = (): void => {
      setAboutOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("grokamp:about", onAbout);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("grokamp:about", onAbout);
    };
  }, []);

  return (
    <div id="desktop" style={doubleSize ? { zoom: 2 } : undefined}>
      <div className="desktop-tag" aria-hidden="true">
        GROKAMP · winamp-grade frontend for grok-build · F=llama? no. type llama.
      </div>
      {WIN_IDS.map((id) => {
        const def = WINDOW_DEFS[id];
        const Body = def.component;
        if (def.frameless === true) {
          return <Body key={id} />;
        }
        return (
          <Win
            key={id}
            id={id}
            title={def.title}
            {...(def.resize !== undefined ? { resize: def.resize } : {})}
          >
            <Body />
          </Win>
        );
      })}
      {aboutOpen && (
        <AboutOverlay
          onClose={() => {
            setAboutOpen(false);
          }}
        />
      )}
    </div>
  );
}

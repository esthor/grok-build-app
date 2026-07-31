// grokmeter server — Bun.serve fullstack: bundles the web deck from
// index.html and streams telemetry over a WebSocket hub at /ws.

import index from "./web/index.html";
import { startDemo } from "./collectors/demo.ts";
import { startGrok } from "./collectors/grok.ts";
import { startMedia } from "./collectors/media.ts";
import { startSystem } from "./collectors/system.ts";
import {
  decodeClientWire,
  encodeWire,
  type AgentSnapshot,
  type FeedItem,
  type FleetEntry,
  type MediaState,
  type ServerInfo,
  type SysStats,
  type Wire,
} from "./shared/protocol.ts";

const PORT = Number(process.env["PORT"] ?? 4517);
// The deck streams sensitive telemetry (prompts, cwd, process list), so it
// binds to loopback unless explicitly overridden.
const HOST = process.env["GROKMETER_HOST"] ?? "127.0.0.1";
const DEMO = process.env["GROKMETER_DEMO"] === "1";
const TOPIC = "wire";
const FEED_BUFFER = 250;

/** WebSockets ignore the same-origin policy; only our own pages may attach. */
function allowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.port !== String(PORT)) return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === HOST;
  } catch {
    return false;
  }
}

const info: ServerInfo = {
  name: "grokmeter",
  version: "0.1.0",
  mode: DEMO ? "demo" : "live",
  startedAt: Date.now(),
};

// Latest-state cache so newly connected decks paint instantly.
let lastSys: SysStats | null = null;
let lastAgent: AgentSnapshot | null = null;
let lastMedia: MediaState | null = null;
let lastFleet: FleetEntry[] = [];
const feedRing: FeedItem[] = [];

/** Focus requests land here once a collector registers its handle. */
let onFocus: (id: string) => void = () => {};

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  development: process.env["NODE_ENV"] !== "production" && { hmr: false },
  routes: {
    "/": index,
  },
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const origin = req.headers.get("origin");
      if (origin !== null && !allowedOrigin(origin)) {
        return new Response("forbidden origin", { status: 403 });
      }
      if (srv.upgrade(req)) return undefined;
      return new Response("websocket upgrade required", { status: 426 });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe(TOPIC);
      ws.send(encodeWire({ t: "hello", server: info }));
      if (lastSys !== null) ws.send(encodeWire({ t: "sys", sys: lastSys }));
      ws.send(encodeWire({ t: "agent", agent: lastAgent }));
      if (lastMedia !== null) ws.send(encodeWire({ t: "media", media: lastMedia }));
      if (feedRing.length > 0) ws.send(encodeWire({ t: "feed", items: feedRing }));
      if (lastFleet.length > 0) ws.send(encodeWire({ t: "fleet", fleet: lastFleet }));
    },
    message(_ws, data) {
      if (typeof data !== "string") return;
      const msg = decodeClientWire(data);
      if (msg !== null) onFocus(msg.id);
    },
    close(ws) {
      ws.unsubscribe(TOPIC);
    },
  },
});

function broadcast(msg: Wire): void {
  server.publish(TOPIC, encodeWire(msg));
}

const emit = {
  sys: (sys: SysStats): void => {
    lastSys = sys;
    broadcast({ t: "sys", sys });
  },
  agent: (agent: AgentSnapshot | null): void => {
    lastAgent = agent;
    broadcast({ t: "agent", agent });
  },
  media: (media: MediaState | null): void => {
    lastMedia = media;
    broadcast({ t: "media", media });
  },
  feed: (items: FeedItem[]): void => {
    feedRing.push(...items);
    if (feedRing.length > FEED_BUFFER) feedRing.splice(0, feedRing.length - FEED_BUFFER);
    broadcast({ t: "feed", items });
  },
  fleet: (fleet: FleetEntry[]): void => {
    lastFleet = fleet;
    broadcast({ t: "fleet", fleet });
  },
};

if (DEMO) {
  const demo = startDemo(emit);
  onFocus = demo.setFocus;
} else {
  startSystem(emit);
  startMedia(emit);
  const grok = startGrok(emit);
  onFocus = grok.setFocus;
}

console.log(`▲ grokmeter ${info.mode} deck on http://localhost:${server.port}`);

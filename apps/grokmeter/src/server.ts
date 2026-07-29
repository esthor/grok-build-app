// grokmeter server — Bun.serve fullstack: bundles the web deck from
// index.html and streams telemetry over a WebSocket hub at /ws.

import index from "./web/index.html";
import { startDemo } from "./collectors/demo.ts";
import { startGrok } from "./collectors/grok.ts";
import { startMedia } from "./collectors/media.ts";
import { startSystem } from "./collectors/system.ts";
import {
  encodeWire,
  type AgentSnapshot,
  type FeedItem,
  type MediaState,
  type ServerInfo,
  type SysStats,
  type Wire,
} from "./shared/protocol.ts";

const PORT = Number(process.env["PORT"] ?? 4517);
const DEMO = process.env["GROKMETER_DEMO"] === "1";
const TOPIC = "wire";
const FEED_BUFFER = 250;

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
const feedRing: FeedItem[] = [];

const server = Bun.serve({
  port: PORT,
  development: process.env["NODE_ENV"] !== "production" && { hmr: false },
  routes: {
    "/": index,
  },
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
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
    },
    message() {
      // Deck is read-only for now.
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
};

if (DEMO) {
  startDemo(emit);
} else {
  startSystem(emit);
  startMedia(emit);
  startGrok(emit);
}

console.log(`▲ grokmeter ${info.mode} deck on http://localhost:${server.port}`);

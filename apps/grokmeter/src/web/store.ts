// Client-side state: caches the latest wire payloads and fans updates out to
// widgets. Rainmeter would call the server's collectors "measures" and the
// widgets "meters"; this store is the wiring loom between them.

import type {
  AgentSnapshot,
  FeedItem,
  FleetEntry,
  MediaState,
  ServerInfo,
  SysStats,
  Wire,
} from "../shared/protocol.ts";

export type StoreEvents = {
  sys: SysStats;
  agent: AgentSnapshot | null;
  feed: FeedItem[];
  media: MediaState | null;
  hello: ServerInfo;
  link: boolean;
  fleet: FleetEntry[];
};

type Handler<T> = (value: T) => void;

const FEED_CAP = 300;

export class Store {
  sys: SysStats | null = null;
  agent: AgentSnapshot | null = null;
  media: MediaState | null = null;
  info: ServerInfo | null = null;
  linked = false;
  fleet: FleetEntry[] = [];
  readonly feed: FeedItem[] = [];
  /** Wired by main() to the WebSocket; widgets use it to request focus. */
  requestFocus: (id: string) => void = () => {};

  private handlers: { [K in keyof StoreEvents]: Set<Handler<StoreEvents[K]>> } = {
    sys: new Set(),
    agent: new Set(),
    feed: new Set(),
    media: new Set(),
    hello: new Set(),
    link: new Set(),
    fleet: new Set(),
  };

  on<K extends keyof StoreEvents>(key: K, fn: Handler<StoreEvents[K]>): void {
    this.handlers[key].add(fn);
  }

  private emit<K extends keyof StoreEvents>(key: K, value: StoreEvents[K]): void {
    for (const fn of this.handlers[key]) fn(value);
  }

  setLink(up: boolean): void {
    this.linked = up;
    this.emit("link", up);
  }

  /** Drop replayable state before a reconnect replays the server's ring
   * buffer, so the feed doesn't duplicate. Emits an empty feed batch as the
   * reset signal (widgets clear when the store's feed is empty). */
  resetFeed(): void {
    this.feed.length = 0;
    this.emit("feed", []);
  }

  ingest(msg: Wire): void {
    switch (msg.t) {
      case "hello":
        this.info = msg.server;
        this.emit("hello", msg.server);
        break;
      case "sys":
        this.sys = msg.sys;
        this.emit("sys", msg.sys);
        break;
      case "agent":
        this.agent = msg.agent;
        this.emit("agent", msg.agent);
        break;
      case "media":
        this.media = msg.media;
        this.emit("media", msg.media);
        break;
      case "feed":
        this.feed.push(...msg.items);
        if (this.feed.length > FEED_CAP) this.feed.splice(0, this.feed.length - FEED_CAP);
        this.emit("feed", msg.items);
        break;
      case "fleet":
        this.fleet = msg.fleet;
        this.emit("fleet", msg.fleet);
        break;
      default: {
        const never: never = msg;
        void never;
      }
    }
  }
}

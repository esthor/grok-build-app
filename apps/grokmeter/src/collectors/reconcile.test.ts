// Regression tests for feed backfill reconciliation across a watch
// replacement (truncation / rotation while a session is focused).
//
//   bun test

import { expect, test } from "bun:test";
import { feedKey, reconcileBackfill } from "./grok.ts";
import type { FeedItem } from "../shared/protocol.ts";

const item = (at: number, text: string): FeedItem => ({ at, kind: "message", text });

const ring = (...items: FeedItem[]): { seq: number; item: FeedItem }[] =>
  items.map((it, i) => ({ seq: i + 1, item: it }));

test("a rebuilt ring owes only records added after the last delivered item", () => {
  const a = item(1000, "one");
  const b = item(2000, "two");
  const c = item(3000, "three: written to the replacement file");
  const rebuilt = ring(a, b, c);

  const owed = reconcileBackfill(rebuilt, feedKey(b));

  expect(owed.map((e) => e.item.text)).toEqual(["three: written to the replacement file"]);
});

test("nothing is owed when the replay ends at the last delivered item", () => {
  const a = item(1000, "one");
  const b = item(2000, "two");

  expect(reconcileBackfill(ring(a, b), feedKey(b))).toEqual([]);
});

test("a rotation sharing no history counts as entirely new", () => {
  const fresh = ring(item(9000, "brand new"), item(9001, "also new"));

  const owed = reconcileBackfill(fresh, feedKey(item(1000, "from the old file")));

  expect(owed.map((e) => e.item.text)).toEqual(["brand new", "also new"]);
});

test("a first attach (no delivery yet) owes the whole ring", () => {
  const fresh = ring(item(1, "a"), item(2, "b"));

  expect(reconcileBackfill(fresh, "")).toHaveLength(2);
});

test("items sharing a timestamp stay distinguishable", () => {
  // FeedItem.at repeats when foldUpdate falls back to the envelope's
  // second-resolution timestamp; identity must not collapse them.
  const first = item(5000, "first at this second");
  const second = item(5000, "second at this second");
  expect(feedKey(first)).not.toBe(feedKey(second));

  const owed = reconcileBackfill(ring(first, second), feedKey(first));
  expect(owed.map((e) => e.item.text)).toEqual(["second at this second"]);
});

test("tool metadata participates in identity", () => {
  const a: FeedItem = { at: 7000, kind: "tool_end", text: "ok", tool: "grep", ms: 12 };
  const b: FeedItem = { at: 7000, kind: "tool_end", text: "ok", tool: "read_file", ms: 12 };
  expect(feedKey(a)).not.toBe(feedKey(b));
});

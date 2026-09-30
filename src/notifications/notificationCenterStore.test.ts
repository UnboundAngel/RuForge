import { describe, expect, it } from "vitest";
import {
  LOCAL_ITEMS_CAP,
  READ_ITEM_MAX_AGE_MS,
  markAllItemsRead,
  markItemsRead,
  parseStoredItems,
  pruneItems,
  upsertItem,
} from "./notificationCenterStore";
import type { NotificationItem } from "./types";

const item = (id: string, createdAt: number, read = false): NotificationItem => ({
  id,
  source: "download",
  kind: "download-finished",
  title: id,
  subtitle: null,
  thumbnail: null,
  channelId: null,
  createdAt,
  read,
  actions: [],
  ref: {},
});

describe("upsertItem", () => {
  it("moves a re-recorded item to the top and marks it unread", () => {
    const list = [item("a", 3), item("b", 2, true), item("c", 1)];
    const next = upsertItem(list, { ...item("b", 10), read: true });
    expect(next.map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(next[0].read).toBe(false);
    expect(next[0].createdAt).toBe(10);
  });

  it("prepends a new item", () => {
    expect(upsertItem([item("a", 1)], item("z", 2)).map((i) => i.id)).toEqual(["z", "a"]);
  });
});

describe("markItemsRead", () => {
  it("marks only the given ids and keeps identity when nothing changes", () => {
    const list = [item("a", 2), item("b", 1)];
    const next = markItemsRead(list, ["b"]);
    expect(next.map((i) => i.read)).toEqual([false, true]);
    expect(markItemsRead(next, ["b"])).toBe(next);
    expect(markAllItemsRead(next).every((i) => i.read)).toBe(true);
  });
});

describe("pruneItems", () => {
  const now = 100 * 86_400_000;

  it("drops read items older than 30 days and keeps old unread ones", () => {
    const old = now - READ_ITEM_MAX_AGE_MS - 1;
    const next = pruneItems([item("fresh", now, true), item("oldRead", old, true), item("oldUnread", old)], now);
    expect(next.map((i) => i.id)).toEqual(["fresh", "oldUnread"]);
  });

  it("caps the list, pushing out the oldest first", () => {
    const list = Array.from({ length: LOCAL_ITEMS_CAP + 5 }, (_, n) => item(`i${n}`, now - n));
    const next = pruneItems(list, now);
    expect(next).toHaveLength(LOCAL_ITEMS_CAP);
    expect(next[next.length - 1].id).toBe(`i${LOCAL_ITEMS_CAP - 1}`);
  });

  it("returns the same array when nothing is pruned", () => {
    const list = [item("a", now), item("b", now - 1)];
    expect(pruneItems(list, now)).toBe(list);
  });
});

describe("parseStoredItems", () => {
  it("tolerates junk", () => {
    expect(parseStoredItems(null)).toEqual([]);
    expect(parseStoredItems("{nope")).toEqual([]);
    expect(parseStoredItems(JSON.stringify({ items: [item("a", 1), { id: 3 }] })).map((i) => i.id)).toEqual(["a"]);
  });
});

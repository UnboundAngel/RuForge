import { describe, expect, it, vi } from "vitest";
import type { NotificationItem, NotificationSource } from "./types";

const item = (id: string, createdAt: number, read: boolean): NotificationItem => ({
  id,
  source: id.startsWith("watchlist:") ? "watchlist" : "download",
  kind: id.startsWith("watchlist:") ? "upload" : "download-finished",
  title: id,
  subtitle: null,
  thumbnail: null,
  channelId: null,
  createdAt,
  read,
  actions: [],
  ref: {},
});

vi.mock("./registry", () => {
  const source = (id: NotificationSource["id"], items: NotificationItem[]): NotificationSource => ({
    id,
    items: () => items,
    markRead: () => {},
    markAllRead: () => {},
    runAction: () => {},
    subscribe: () => () => {},
  });
  return {
    NOTIFICATION_SOURCES: [
      source("watchlist", [item("watchlist:a", 3, false), item("watchlist:b", 1, true)]),
      source("download", [item("download:j1", 2, false), item("download:j2", 4, false)]),
    ],
  };
});

const { allItems, unreadCount } = await import("./selectors");

describe("selectors", () => {
  it("merges every source newest first", () => {
    expect(allItems().map((i) => i.id)).toEqual(["download:j2", "watchlist:a", "download:j1", "watchlist:b"]);
  });

  it("sums unread across sources", () => {
    expect(unreadCount()).toBe(3);
  });
});

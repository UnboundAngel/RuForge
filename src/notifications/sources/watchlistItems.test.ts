import { describe, expect, it } from "vitest";
import type { LiveStatus, WatchlistUpload } from "@/watchlist/types";
import { videoIdsFromItemIds, watchlistItems, watchlistUploadToItem } from "./watchlistItems";

const upload = (videoId: string, liveStatus: LiveStatus = "none", seen = false): WatchlistUpload => ({
  videoId,
  channelId: "UCabcdefghijklmnopqrstuv",
  channelTitle: "Chan",
  title: `Video ${videoId}`,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  publishedAt: 1_700_000_000,
  discoveredAt: 1_700_000_100,
  durationSec: 600,
  liveStatus,
  scheduledAt: liveStatus === "upcoming" ? 1_700_100_000 : null,
  seen,
  autoQueued: false,
});

describe("watchlistUploadToItem", () => {
  it("projects a normal upload with queue and open", () => {
    const item = watchlistUploadToItem(upload("a"));
    expect(item.id).toBe("watchlist:a");
    expect(item.kind).toBe("upload");
    expect(item.subtitle).toBe("Chan");
    expect(item.actions).toEqual(["queue", "open-explorer"]);
    expect(item.createdAt).toBe(1_700_000_100_000);
    expect(item.read).toBe(false);
  });

  it("omits queue on premieres and live streams", () => {
    const premiere = watchlistUploadToItem(upload("p", "upcoming"));
    expect(premiere.kind).toBe("premiere");
    expect(premiere.subtitle?.startsWith("Premieres ")).toBe(true);
    expect(premiere.actions).toEqual(["open-explorer"]);
    const live = watchlistUploadToItem(upload("l", "live"));
    expect(live.kind).toBe("live");
    expect(live.subtitle).toBe("Live now");
    expect(live.actions).not.toContain("queue");
  });

  it("reads seen from Rust", () => {
    expect(watchlistUploadToItem(upload("s", "none", true)).read).toBe(true);
  });
});

describe("watchlistItems", () => {
  it("is empty without a snapshot", () => {
    expect(watchlistItems(null)).toEqual([]);
  });

  it("maps item ids back to video ids", () => {
    expect(videoIdsFromItemIds(["watchlist:a", "download:j1", "watchlist:b"])).toEqual(["a", "b"]);
  });
});

import { describe, expect, it } from "vitest";
import type { LiveStatus, WatchlistSnapshot, WatchlistUpload } from "./types";
import { shelfUploads, toFeedVideo, unseenUploads } from "./watchlistSelectors";

const upload = (videoId: string, seen = false, liveStatus: LiveStatus = "none"): WatchlistUpload => ({
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
  scheduledAt: null,
  seen,
  autoQueued: false,
});

const snap = (uploads: WatchlistUpload[]): WatchlistSnapshot => ({
  channels: [],
  uploads,
  unseenCount: uploads.filter((u) => !u.seen).length,
  checkIntervalMin: 30,
});

describe("unseenUploads", () => {
  it("keeps only unseen uploads in order", () => {
    const s = snap([upload("a"), upload("b", true), upload("c")]);
    expect(unseenUploads(s).map((u) => u.videoId)).toEqual(["a", "c"]);
    expect(unseenUploads(null)).toEqual([]);
  });
});

describe("shelfUploads", () => {
  it("drops seen, upcoming, live and library videos, then caps", () => {
    const s = snap([
      upload("a"),
      upload("b", true),
      upload("c", false, "upcoming"),
      upload("d", false, "live"),
      upload("e"),
      upload("f"),
      upload("g"),
    ]);
    expect(shelfUploads(s, new Set(["e"]), 2).map((u) => u.videoId)).toEqual(["a", "f"]);
    expect(shelfUploads(s, new Set(), 0)).toEqual([]);
    expect(shelfUploads(null, new Set(), 4)).toEqual([]);
  });
});

describe("toFeedVideo", () => {
  it("maps an upload onto a feed card", () => {
    expect(toFeedVideo(upload("a"))).toEqual({
      videoId: "a",
      title: "Video a",
      url: "https://www.youtube.com/watch?v=a",
      channel: "Chan",
      channelId: "UCabcdefghijklmnopqrstuv",
      channelVerified: false,
      thumbnail: "https://i.ytimg.com/vi/a/mqdefault.jpg",
      duration: 600,
      viewCount: null,
      timestamp: 1_700_000_000,
      short: false,
    });
  });
});

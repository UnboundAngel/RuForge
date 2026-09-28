import { describe, expect, it } from "vitest";
import type { DownloadJob } from "@/downloadQueue";
import type { GalleryEntry, MediaFile } from "@/types";
import type { LiveStatus, WatchedChannel, WatchlistSnapshot, WatchlistUpload } from "./types";
import { pickAutoDownloads, watchlistAlertCopy, watchlistStorageBlockedCopy } from "./watchlistAlertRules";

const CH_A = "UCaaaaaaaaaaaaaaaaaaaaaa";
const CH_B = "UCbbbbbbbbbbbbbbbbbbbbbb";

const upload = (
  videoId: string,
  opts: { channelId?: string; channelTitle?: string; liveStatus?: LiveStatus; autoQueued?: boolean } = {},
): WatchlistUpload => ({
  videoId,
  channelId: opts.channelId ?? CH_A,
  channelTitle: opts.channelTitle ?? "Alpha",
  title: `Video ${videoId}`,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  publishedAt: 1_700_000_000,
  discoveredAt: 1_700_000_100,
  durationSec: 600,
  liveStatus: opts.liveStatus ?? "none",
  scheduledAt: null,
  seen: false,
  autoQueued: opts.autoQueued ?? false,
});

const channel = (channelId: string, autoDownload: boolean): WatchedChannel => ({
  channelId,
  title: channelId,
  handle: null,
  followedAt: 0,
  autoDownload,
  lastCheckedAt: null,
  lastError: null,
});

const snap = (channels: WatchedChannel[], uploads: WatchlistUpload[]): WatchlistSnapshot => ({
  channels,
  uploads,
  unseenCount: uploads.length,
  checkIntervalMin: 30,
});

describe("watchlistAlertCopy", () => {
  it("names a single upload", () => {
    expect(watchlistAlertCopy([upload("aaaaaaaaaaa")], 0)).toBe("New from Alpha: Video aaaaaaaaaaa");
  });

  it("calls out a premiere and a live stream", () => {
    expect(watchlistAlertCopy([upload("aaaaaaaaaaa", { liveStatus: "upcoming" })], 0)).toBe(
      "Alpha scheduled a premiere: Video aaaaaaaaaaa",
    );
    expect(watchlistAlertCopy([upload("aaaaaaaaaaa", { liveStatus: "live" })], 0)).toBe(
      "Alpha is live: Video aaaaaaaaaaa",
    );
  });

  it("groups one channel, then many channels", () => {
    expect(watchlistAlertCopy([upload("aaaaaaaaaaa"), upload("bbbbbbbbbbb")], 0)).toBe("2 new uploads from Alpha");
    expect(
      watchlistAlertCopy([upload("aaaaaaaaaaa"), upload("bbbbbbbbbbb", { channelId: CH_B, channelTitle: "Beta" })], 0),
    ).toBe("2 new uploads from channels you follow");
  });

  it("appends the download note only when something was queued", () => {
    expect(watchlistAlertCopy([upload("aaaaaaaaaaa")], 1)).toBe("New from Alpha: Video aaaaaaaaaaa Downloading now.");
  });

  it("words the storage warning for one or many", () => {
    expect(watchlistStorageBlockedCopy(1)).toBe(
      "Storage limit reached. 1 new upload from channels you follow was not downloaded.",
    );
    expect(watchlistStorageBlockedCopy(3)).toBe(
      "Storage limit reached. 3 new uploads from channels you follow were not downloaded.",
    );
  });
});

describe("pickAutoDownloads", () => {
  const channels = [channel(CH_A, true), channel(CH_B, false)];

  it("keeps opted-in normal videos only", () => {
    const uploads = [
      upload("aaaaaaaaaaa"),
      upload("bbbbbbbbbbb", { channelId: CH_B }),
      upload("ccccccccccc", { liveStatus: "upcoming" }),
      upload("ddddddddddd", { liveStatus: "live" }),
    ];
    const picks = pickAutoDownloads(uploads, snap(channels, uploads), [], [], new Set());
    expect(picks.map((u) => u.videoId)).toEqual(["aaaaaaaaaaa"]);
  });

  it("never re-queues what Rust or this session already queued", () => {
    const queuedInRust = upload("aaaaaaaaaaa", { autoQueued: true });
    const stale = upload("bbbbbbbbbbb");
    const fresh = upload("ccccccccccc");
    const s = snap(channels, [queuedInRust, { ...stale, autoQueued: true }, fresh]);
    const picks = pickAutoDownloads([queuedInRust, stale, fresh, fresh], s, [], [], new Set(["ccccccccccc"]));
    expect(picks).toEqual([]);
  });

  it("skips videos already in the library or the queue", () => {
    const uploads = [upload("aaaaaaaaaaa"), upload("bbbbbbbbbbb"), upload("ccccccccccc")];
    const entries = [
      { kind: "media", sourceUrl: "https://youtu.be/aaaaaaaaaaa", path: "C:/v/a.mp4", name: "a" } as unknown as MediaFile,
    ] as GalleryEntry[];
    const jobs = [
      { url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", status: "queued" },
    ] as unknown as DownloadJob[];
    const picks = pickAutoDownloads(uploads, snap(channels, uploads), entries, jobs, new Set());
    expect(picks.map((u) => u.videoId)).toEqual(["ccccccccccc"]);
  });

  it("does nothing before the first snapshot", () => {
    expect(pickAutoDownloads([upload("aaaaaaaaaaa")], null, [], [], new Set())).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { buildIslandWatchlist, ISLAND_WATCHLIST_TAKEOVER_MS } from "./islandWatchlist";
import type { LiveStatus, WatchlistSnapshot, WatchlistUpload } from "./types";

const upload = (
  videoId: string,
  channelId: string,
  opts: { seen?: boolean; liveStatus?: LiveStatus; channelTitle?: string } = {},
): WatchlistUpload => ({
  videoId,
  channelId,
  channelTitle: opts.channelTitle ?? `Chan ${channelId}`,
  title: `Video ${videoId}`,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  publishedAt: 1_700_000_000,
  discoveredAt: 1_700_000_100,
  durationSec: 600,
  liveStatus: opts.liveStatus ?? "none",
  scheduledAt: null,
  seen: opts.seen ?? false,
  autoQueued: false,
});

const snap = (uploads: WatchlistUpload[]): WatchlistSnapshot => ({
  channels: [],
  uploads,
  unseenCount: uploads.filter((u) => !u.seen).length,
  checkIntervalMin: 30,
});

const noAvatar = () => null;

describe("buildIslandWatchlist", () => {
  it("is null without a snapshot or batch", () => {
    expect(buildIslandWatchlist({ snapshot: null, islandBatchIds: ["a"], islandBatchAt: 0 }, noAvatar, 0)).toBeNull();
    expect(
      buildIslandWatchlist({ snapshot: snap([upload("a", "A")]), islandBatchIds: [], islandBatchAt: 0 }, noAvatar, 0),
    ).toBeNull();
  });

  it("keeps only batch uploads that are still unseen, in snapshot order", () => {
    const s = snap([upload("a", "A"), upload("b", "A", { seen: true }), upload("c", "B"), upload("d", "C")]);
    const w = buildIslandWatchlist({ snapshot: s, islandBatchIds: ["c", "a", "b"], islandBatchAt: 0 }, noAvatar, 0);
    expect(w?.count).toBe(2);
    expect(w?.rows.map((r) => r.videoId)).toEqual(["a", "c"]);
  });

  it("is null once the whole batch is seen", () => {
    const s = snap([upload("a", "A", { seen: true })]);
    expect(buildIslandWatchlist({ snapshot: s, islandBatchIds: ["a"], islandBatchAt: 0 }, noAvatar, 0)).toBeNull();
  });

  it("shows one face per channel, capped at three, with initials and resolved avatars", () => {
    const s = snap([
      upload("a", "A", { channelTitle: "alpha" }),
      upload("b", "A"),
      upload("c", "B"),
      upload("d", "C"),
      upload("e", "D"),
    ]);
    const w = buildIslandWatchlist(
      { snapshot: s, islandBatchIds: ["a", "b", "c", "d", "e"], islandBatchAt: 0 },
      (id) => (id === "B" ? "asset://b.jpg" : null),
      0,
    );
    expect(w?.faces).toEqual([
      { src: null, initial: "A" },
      { src: "asset://b.jpg", initial: "C" },
      { src: null, initial: "C" },
    ]);
  });

  it("caps rows at six but counts everything", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const s = snap(ids.map((id) => upload(id, "A")));
    const w = buildIslandWatchlist({ snapshot: s, islandBatchIds: ids, islandBatchAt: 0 }, noAvatar, 0);
    expect(w?.count).toBe(8);
    expect(w?.rows).toHaveLength(6);
  });

  it("flags premieres and live streams as upcoming", () => {
    const s = snap([upload("p", "A", { liveStatus: "upcoming" }), upload("l", "A", { liveStatus: "live" })]);
    const w = buildIslandWatchlist({ snapshot: s, islandBatchIds: ["p", "l"], islandBatchAt: 0 }, noAvatar, 0);
    expect(w?.rows.map((r) => [r.upcoming, r.live])).toEqual([
      [true, false],
      [true, true],
    ]);
  });

  it("takes over only while the batch is fresh", () => {
    const s = snap([upload("a", "A")]);
    const state = { snapshot: s, islandBatchIds: ["a"], islandBatchAt: 10_000 };
    expect(buildIslandWatchlist(state, noAvatar, 10_000 + ISLAND_WATCHLIST_TAKEOVER_MS - 1)?.takeover).toBe(true);
    expect(buildIslandWatchlist(state, noAvatar, 10_000 + ISLAND_WATCHLIST_TAKEOVER_MS)?.takeover).toBe(false);
  });
});

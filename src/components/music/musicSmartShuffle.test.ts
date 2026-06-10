import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types";
import { resetListenSnapshotForTests } from "@/lib/musicListenSnapshot";
import { clearListenStats, recordListenStatsPlay } from "./musicListenStats";
import { buildSmartShuffleOrder, pickSmartNextTrack, smartShuffleWeight } from "./musicSmartShuffle";
import { musicTrackIdentityKey } from "./musicShelfDedup";
import { primaryArtist } from "./musicArtist";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { store = {}; },
});

function track(id: string, artist: string): MediaFile {
  return {
    path: `/${id}.mp3`,
    name: `Track ${id}`,
    artist,
    size: 0,
    created: 0,
    duration: 0,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: id,
  };
}

beforeEach(() => {
  resetListenSnapshotForTests();
  clearListenStats();
  store = {};
});

describe("musicSmartShuffle", () => {
  it("excludes session-recent keys from weight", () => {
    const f = track("a", "Artist");
    const key = musicTrackIdentityKey(f, primaryArtist);
    const w = smartShuffleWeight(f, {
      statsByKey: new Map(),
      likedSet: new Set(),
      sessionRecent: new Set([key]),
      current: null,
    });
    expect(w).toBe(0);
  });

  it("buildSmartShuffleOrder returns a permutation", () => {
    const pool = [track("1", "A"), track("2", "B"), track("3", "C")];
    const order = buildSmartShuffleOrder({ pool, seed: 42 });
    expect(order).toHaveLength(3);
    expect(new Set(order.map((f) => f.path)).size).toBe(3);
  });

  it("pickSmartNextTrack avoids session recent when possible", () => {
    const pool = [track("1", "A"), track("2", "B"), track("3", "C")];
    const current = pool[0]!;
    const recentKey = musicTrackIdentityKey(pool[1]!, primaryArtist);
    const next = pickSmartNextTrack({
      pool,
      current,
      sessionRecentKeys: [recentKey],
      seed: 99,
    });
    expect(next).not.toBeNull();
    expect(next!.path).not.toBe(current.path);
    const nextKey = musicTrackIdentityKey(next!, primaryArtist);
    expect(nextKey).not.toBe(recentKey);
  });

  it("boosts liked tracks in weight", () => {
    const liked = track("liked", "Star");
    const other = track("other", "Star");
    recordListenStatsPlay(other);
    const likedKey = musicTrackIdentityKey(liked, primaryArtist);
    const ctx = {
      statsByKey: new Map(),
      likedSet: new Set([likedKey]),
      sessionRecent: new Set<string>(),
      current: null,
    };
    expect(smartShuffleWeight(liked, ctx)).toBeGreaterThan(smartShuffleWeight(other, ctx));
  });
});

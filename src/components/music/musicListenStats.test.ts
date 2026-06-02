import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types";
import {
  addListenTime,
  clearListenStats,
  getStatsSince,
  getTopArtistsSince,
  getTopTracksSince,
  getTotalPlayCount,
  getTopArtists,
  getTopTracks,
  getTotalListenTimeSec,
  recordListenStatsPlay,
  SEVEN_DAYS_MS,
} from "./musicListenStats";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { store = {}; },
});

function track(partial: Partial<MediaFile> & Pick<MediaFile, "path" | "name">): MediaFile {
  return {
    size: 0,
    created: 0,
    duration: 0,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
    ...partial,
  };
}

beforeEach(() => {
  clearListenStats();
  store = {};
});

describe("musicListenStats", () => {
  it("records play count and listen time", () => {
    const a = track({ path: "/a.mp3", name: "A", artist: "Artist A", sourceId: "x1" });
    recordListenStatsPlay(a);
    addListenTime(a, 120);
    expect(getTotalListenTimeSec()).toBe(120);
    const top = getTopTracks(1);
    expect(top[0]!.identityKey).toBe("id:x1");
    expect(top[0]!.playCount).toBe(1);
  });

  it("aggregates top artists by listen time", () => {
    const a = track({ path: "/a.mp3", name: "A", artist: "Alpha", sourceId: "a" });
    const b = track({ path: "/b.mp3", name: "B", artist: "Beta", sourceId: "b" });
    recordListenStatsPlay(a);
    recordListenStatsPlay(b);
    addListenTime(a, 300);
    addListenTime(b, 50);
    const artists = getTopArtists(2);
    expect(artists[0]!.display).toBe("Alpha");
    expect(artists[1]!.display).toBe("Beta");
  });

  it("sums total play count and filters by recent window", () => {
    const a = track({ path: "/a.mp3", name: "A", artist: "Alpha", sourceId: "a" });
    const b = track({ path: "/b.mp3", name: "B", artist: "Beta", sourceId: "b" });
    recordListenStatsPlay(a);
    recordListenStatsPlay(a);
    recordListenStatsPlay(b);
    addListenTime(a, 200);
    addListenTime(b, 40);
    expect(getTotalPlayCount()).toBe(3);
    const recent = getStatsSince(SEVEN_DAYS_MS);
    expect(recent.playCount).toBe(3);
    expect(recent.listenTimeSec).toBe(240);
    expect(getTopTracksSince(1, SEVEN_DAYS_MS)[0]!.title).toBe("A");
    expect(getTopArtistsSince(1, SEVEN_DAYS_MS)[0]!.display).toBe("Alpha");
  });
});

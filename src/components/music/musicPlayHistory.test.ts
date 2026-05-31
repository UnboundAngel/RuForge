import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types";
import {
  clearHistory,
  getPlayCount,
  getRecentHistory,
  getMostPlayedHistory,
  recordPlay,
} from "./musicPlayHistory";

// Polyfill localStorage for vitest jsdom-less env
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
  clearHistory();
  store = {};
});

describe("musicPlayHistory", () => {
  it("records a play and retrieves it", () => {
    const a = track({ path: "/a.mp3", name: "Song A", artist: "Artist A", sourceId: "id1" });
    recordPlay(a);
    const recent = getRecentHistory();
    expect(recent).toHaveLength(1);
    expect(recent[0]!.identityKey).toBe("id:id1");
    expect(recent[0]!.playCount).toBe(1);
  });

  it("increments play count on repeat play", () => {
    const a = track({ path: "/a.mp3", name: "Song A", sourceId: "id1" });
    recordPlay(a);
    recordPlay(a);
    recordPlay(a);
    expect(getPlayCount("id:id1")).toBe(3);
    expect(getRecentHistory()).toHaveLength(1);
  });

  it("dedupes by identity key across different paths", () => {
    const a = track({ path: "/a.mp3", name: "Song A", sourceId: "shared" });
    const b = track({ path: "/b.mp3", name: "Song A", sourceId: "shared" });
    recordPlay(a);
    recordPlay(b);
    expect(getRecentHistory()).toHaveLength(1);
    expect(getPlayCount("id:shared")).toBe(2);
  });

  it("getMostPlayedHistory sorts by play count desc", () => {
    const a = track({ path: "/a.mp3", name: "A", sourceId: "a" });
    const b = track({ path: "/b.mp3", name: "B", sourceId: "b" });
    recordPlay(a);
    recordPlay(b);
    recordPlay(b);
    const most = getMostPlayedHistory();
    expect(most[0]!.identityKey).toBe("id:b");
    expect(most[1]!.identityKey).toBe("id:a");
  });

  it("caps ring buffer at 50", () => {
    for (let i = 0; i < 60; i++) {
      recordPlay(track({ path: `/t${i}.mp3`, name: `Track ${i}`, sourceId: `id${i}` }));
    }
    expect(getRecentHistory()).toHaveLength(50);
  });
});

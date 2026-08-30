import { describe, expect, it, vi } from "vitest";
import type { MediaFile } from "@/types";
import {
  buildShuffledQueueFromBase,
  restoreQueueFromBase,
} from "./musicShuffleQueue";

function track(id: string, artist = "A"): MediaFile {
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

describe("musicShuffleQueue", () => {
  it("keeps current first and permutes the rest", () => {
    const a = track("a");
    const b = track("b", "B");
    const c = track("c", "C");
    const d = track("d", "D");
    const queue = buildShuffledQueueFromBase({
      base: [a, b, c, d],
      current: c,
      seed: 7,
    });
    expect(queue[0]).toBe(c);
    expect(queue).toHaveLength(4);
    expect(new Set(queue.map((f) => f.path)).size).toBe(4);
  });

  it("restores base order when current is in base", () => {
    const a = track("a");
    const b = track("b");
    const c = track("c");
    const base = [a, b, c];
    expect(restoreQueueFromBase(base, c)).toEqual(base);
  });

  it("returns null when current is outside base", () => {
    const a = track("a");
    const b = track("b");
    const outsider = track("z");
    expect(restoreQueueFromBase([a, b], outsider)).toBeNull();
  });
});

describe("musicShuffleQueue LS", () => {
  it("round-trips the sticky flag", async () => {
    let store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
    });
    const { readMusicShuffleOnFromLs, writeMusicShuffleOnToLs } = await import(
      "./musicShuffleQueue"
    );
    expect(readMusicShuffleOnFromLs()).toBe(false);
    writeMusicShuffleOnToLs(true);
    expect(readMusicShuffleOnFromLs()).toBe(true);
    writeMusicShuffleOnToLs(false);
    expect(readMusicShuffleOnFromLs()).toBe(false);
  });
});

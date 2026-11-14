import { describe, expect, it, vi } from "vitest";
import type { MediaFile } from "../types";
import { isInVideoPlaylist, playlistEndSuggestions, playlistLoopNext, shuffledCopy } from "./playlistPlayback";

const v = (n: number) => ({ path: `C:/v/${n}.mp4`, duration: 60 }) as unknown as MediaFile;
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
const list = [v(1), v(2), v(3)];

describe("playlistPlayback", () => {
  it("detects a video inside a playlist", () => {
    expect(isInVideoPlaylist(list[1]!, list)).toBe(true);
    expect(isInVideoPlaylist(v(9), list)).toBe(false);
    expect(isInVideoPlaylist(list[0]!, [list[0]!])).toBe(false);
  });

  it("loops within the playlist", () => {
    expect(playlistLoopNext(list[2]!, list)).toBe(list[0]);
    expect(playlistLoopNext(v(9), list)).toBeNull();
  });

  it("puts the next item first mid-playlist and autoplays", () => {
    const r = playlistEndSuggestions(list[0]!, list);
    expect(r.autoplay).toBe(true);
    expect(r.suggestions).toEqual([list[1], list[2]]);
  });

  it("stays inside the playlist and does not autoplay at the last item", () => {
    const r = playlistEndSuggestions(list[2]!, list);
    expect(r.autoplay).toBe(false);
    expect(r.suggestions.every((f) => list.includes(f) && f !== list[2])).toBe(true);
  });

  it("shuffles a copy", () => {
    const out = shuffledCopy(list, () => 0);
    expect(out).toHaveLength(3);
    expect(list[0]!.path).toBe("C:/v/1.mp4");
  });
});

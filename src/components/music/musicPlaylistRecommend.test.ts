import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import { recommendForPlaylist } from "./musicPlaylistRecommend";

function track(name: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name,
    path: `C:\\m\\${name}.mp3`,
    size: 1,
    created: 1,
    duration: 100,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
    ...extra,
  };
}

const seed = track("seed", { artist: "Bad Omens", album: "TDOPOM" });
const sameArtist = track("same artist", { artist: "Bad Omens", album: "Other" });
const sameAlbum = track("same album", { artist: "Someone", album: "TDOPOM" });
const newest = track("newest", { artist: "X", created: 99 });
const older = track("older", { artist: "Y", created: 5 });
const library = [older, seed, newest, sameAlbum, sameArtist];

describe("recommendForPlaylist", () => {
  it("leaves out songs already in the playlist", () => {
    expect(recommendForPlaylist(library, [seed])).not.toContain(seed);
  });

  it("ranks shared artist, then shared album, then newest downloads", () => {
    expect(recommendForPlaylist(library, [seed])).toEqual([sameArtist, sameAlbum, newest, older]);
  });

  it("falls back to newest downloads for an empty playlist", () => {
    expect(recommendForPlaylist(library, [], 0, 2)).toEqual([newest, older]);
  });

  it("pages to new songs on refresh", () => {
    const big = Array.from({ length: 25 }, (_, i) => track(`t${i}`, { created: 100 - i }));
    const first = recommendForPlaylist(big, [], 0, 10);
    const second = recommendForPlaylist(big, [], 1, 10);
    expect(first).toHaveLength(10);
    expect(second.some((t) => first.includes(t))).toBe(false);
  });
});

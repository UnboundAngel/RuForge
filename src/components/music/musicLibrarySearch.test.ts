import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import { matchScore, searchMusicLibrary } from "./musicLibrarySearch";

function track(name: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name: `${name}.mp3`,
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
    ...extra,
  } as MediaFile;
}

function playlist(id: string, title: string, paths: string[] = []): VirtualPlaylistRecord {
  return { id, title, items: paths.map((path) => ({ path, addedAt: 1 })), updatedAt: 1, kind: "music" };
}

describe("matchScore", () => {
  it("ranks exact over prefix over word start over substring", () => {
    expect(matchScore("Lucid Dreams", "lucid dreams")).toBe(4);
    expect(matchScore("Lucid Dreams", "lucid")).toBe(3);
    expect(matchScore("Lucid Dreams", "dreams")).toBe(2);
    expect(matchScore("Lucid Dreams", "ream")).toBe(1);
    expect(matchScore("Lucid Dreams", "nope")).toBe(0);
  });
});

describe("searchMusicLibrary", () => {
  const tracks = [
    track("Lucid Dreams", { artist: "Juice WRLD" }),
    track("Robbery", { artist: "Juice WRLD, Trippie Redd" }),
    track("Chill Vibes", { artist: "Lofi Girl" }),
  ];

  it("returns nothing for an empty query", () => {
    expect(searchMusicLibrary("  ", tracks, [])).toEqual([]);
  });

  it("finds playlists by title", () => {
    const hits = searchMusicLibrary("chill", tracks, [playlist("p1", "Chill mix", [tracks[2]!.path])]);
    const list = hits.find((h) => h.kind === "playlist");
    expect(list).toMatchObject({ id: "p1", title: "Chill mix", count: 1 });
  });

  it("puts the artist first when the query is the artist's name", () => {
    const hits = searchMusicLibrary("juice wrld", tracks, []);
    expect(hits[0]).toMatchObject({ kind: "artist", title: "Juice WRLD" });
    expect(hits.filter((h) => h.kind === "artist")).toHaveLength(1);
  });

  it("puts an exact song title ahead of partial matches", () => {
    const hits = searchMusicLibrary("lucid dreams", tracks, [playlist("p1", "Lucid dreams and more")]);
    expect(hits[0]).toMatchObject({ kind: "song", title: "Lucid Dreams" });
  });
});

import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import { sidebarArtists, sidebarPlaylists } from "./musicLibrarySidebar";

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

function playlist(id: string, title: string, updatedAt: number): VirtualPlaylistRecord {
  return { id, title, kind: "music", updatedAt, items: [] };
}

const gym = playlist("1", "gym", 20);
const chill = playlist("2", "Chill", 30);
const adrenaline = playlist("3", "adrenaline", 10);
const records = [gym, chill, adrenaline];

describe("sidebarPlaylists", () => {
  it("sorts by recents, alphabetical, or keeps custom store order", () => {
    expect(sidebarPlaylists(records, "recents", "")).toEqual([chill, gym, adrenaline]);
    expect(sidebarPlaylists(records, "alphabetical", "")).toEqual([adrenaline, chill, gym]);
    expect(sidebarPlaylists(records, "custom", "")).toEqual(records);
  });

  it("filters by title, case-insensitively", () => {
    expect(sidebarPlaylists(records, "custom", "  CH ")).toEqual([chill]);
    expect(sidebarPlaylists(records, "custom", "zzz")).toEqual([]);
  });
});

describe("sidebarArtists", () => {
  const tracks = [
    track("one", { artist: "Zed feat. Amy", created: 5, thumbnailPath: "zed.jpg" }),
    track("two", { artist: "zed", created: 50 }),
    track("three", { artist: "Amy", created: 20 }),
    track("untagged"),
  ];

  it("groups by primary artist and skips tracks without one", () => {
    const zed = sidebarArtists(tracks, "custom", "").find((a) => a.key === "zed");
    expect(zed).toMatchObject({ name: "Zed", trackCount: 2, latest: 50, cover: "zed.jpg" });
    expect(sidebarArtists(tracks, "custom", "")).toHaveLength(2);
  });

  it("sorts by name, newest track, or track count", () => {
    const names = (sort: "recents" | "alphabetical" | "custom") => sidebarArtists(tracks, sort, "").map((a) => a.name);
    expect(names("alphabetical")).toEqual(["Amy", "Zed"]);
    expect(names("recents")).toEqual(["Zed", "Amy"]);
    expect(names("custom")).toEqual(["Zed", "Amy"]);
  });

  it("filters by artist name", () => {
    expect(sidebarArtists(tracks, "custom", "am").map((a) => a.name)).toEqual(["Amy"]);
  });
});

import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import { createVirtualPlaylistRecord, virtualPlaylistPath } from "@/virtualPlaylists";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import {
  filterTracksByQuery,
  musicPlaylistRecords,
  pathsMissingFromRecord,
  playlistMembership,
  resolveMusicPlaylistTracks,
} from "./musicPlaylists";

function track(path: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name: path.split(/[/\\]/).pop() || path,
    path,
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

describe("musicPlaylists", () => {
  it("lists only music playlists, newest first", () => {
    const old = createVirtualPlaylistRecord("Old", [], 1, "music");
    const fresh = createVirtualPlaylistRecord("Fresh", [], 5, "music");
    const video = createVirtualPlaylistRecord("Clips", [], 9);
    expect(musicPlaylistRecords([old, video, fresh]).map((r) => r.title)).toEqual(["Fresh", "Old"]);
  });

  it("resolves tracks in record order and reports missing files", () => {
    const a = track("C:\\m\\a.mp3");
    const b = track("C:\\m\\b.mp3");
    const record = createVirtualPlaylistRecord("Mix", ["C:/m/b.mp3", "C:\\m\\gone.mp3", "C:\\M\\A.mp3"], 1, "music");
    const { tracks, missingPaths } = resolveMusicPlaylistTracks(record, [a, b]);
    expect(tracks).toEqual([b, a]);
    expect(missingPaths).toEqual(["C:\\m\\gone.mp3"]);
  });

  it("reports membership for single and bulk selections", () => {
    const record = createVirtualPlaylistRecord("Mix", ["C:\\a.mp3"], 1, "music");
    expect(playlistMembership(record, ["C:\\a.mp3"])).toBe("all");
    expect(playlistMembership(record, ["C:\\a.mp3", "C:\\b.mp3"])).toBe("some");
    expect(playlistMembership(record, ["C:\\b.mp3"])).toBe("none");
    expect(pathsMissingFromRecord(record, ["C:\\A.MP3", "C:\\b.mp3"])).toEqual(["C:\\b.mp3"]);
  });

  it("searches title, artist, and album", () => {
    const tracks = [
      track("C:\\1.mp3", { name: "Paranoid", artist: "Aloboi" }),
      track("C:\\2.mp3", { name: "Tesla", album: "Slowed Mix" }),
    ];
    expect(filterTracksByQuery(tracks, "alob").map((t) => t.path)).toEqual(["C:\\1.mp3"]);
    expect(filterTracksByQuery(tracks, "slowed").map((t) => t.path)).toEqual(["C:\\2.mp3"]);
    expect(filterTracksByQuery(tracks, "  ")).toEqual([]);
  });

  it("library flatten skips virtual playlists so songs are not listed twice", () => {
    const file = track("C:\\m\\a.mp3");
    const entries = [
      { kind: "playlist", path: virtualPlaylistPath("x"), title: "Mix", items: [file] },
      { kind: "media", ...file },
    ];
    expect(flattenGalleryScanToMediaFiles(entries).map((f) => f.path)).toEqual(["C:\\m\\a.mp3"]);
  });
});

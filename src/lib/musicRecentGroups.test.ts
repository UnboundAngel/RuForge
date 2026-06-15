import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import {
  buildRecentAddedGroups,
  groupPlaylistDownloads,
  playlistDisplayTitle,
  playlistFolderKey,
} from "./musicRecentGroups";

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

describe("musicRecentGroups", () => {
  it("reads playlist folder from path", () => {
    expect(playlistFolderKey("C:/lib/Playlists/Chill Mix/01 - Song.mp3")).toBe("chill mix");
    expect(playlistFolderKey("C:/lib/Music/Song/song.mp3")).toBeNull();
  });

  it("formats playlist folder title", () => {
    expect(playlistDisplayTitle("chill", "C:/lib/Playlists/Chill_Vibes/01.mp3")).toBe("Chill Vibes");
  });

  it("groups playlist downloads by folder", () => {
    const tracks = [
      track({ path: "/lib/Playlists/Mix/02 - B.mp3", name: "B", created: 20, playlistIndex: 2 }),
      track({ path: "/lib/Playlists/Mix/01 - A.mp3", name: "A", created: 10, playlistIndex: 1 }),
      track({ path: "/lib/Music/Solo/solo.mp3", name: "Solo", created: 30 }),
    ];
    const groups = groupPlaylistDownloads(tracks);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.tracks.map((t) => t.name)).toEqual(["A", "B"]);
    expect(groups[0]?.title).toBe("Mix");
  });

  it("splits recent added into playlists, songs, and multi-track albums", () => {
    const tracks = [
      track({
        path: "/lib/Playlists/PL/01.mp3",
        name: "P1",
        created: 100,
        playlistIndex: 1,
      }),
      track({
        path: "/lib/Music/Solo/solo.mp3",
        name: "Solo",
        artist: "Artist",
        album: "Solo",
        created: 90,
      }),
      track({
        path: "/lib/Music/Eden/01.mp3",
        name: "One",
        artist: "Band",
        album: "Eden",
        created: 80,
      }),
      track({
        path: "/lib/Music/Eden/02.mp3",
        name: "Two",
        artist: "Band",
        album: "Eden",
        created: 85,
      }),
    ];
    const { playlists, songs, albums } = buildRecentAddedGroups(tracks);
    expect(playlists).toHaveLength(1);
    expect(songs).toHaveLength(1);
    expect(songs[0]?.name).toBe("Solo");
    expect(albums).toHaveLength(1);
    expect(albums[0]?.album).toBe("Eden");
  });
});

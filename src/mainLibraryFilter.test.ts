import { describe, expect, it } from "vitest";
import { filterMainLibraryEntries, isAudioGalleryEntry } from "./mainLibraryFilter";
import type { GalleryEntry, MediaFile } from "./types";

function media(path: string): GalleryEntry {
  return {
    kind: "media",
    name: path.split("/").pop() ?? path,
    path,
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
  };
}

function playlist(title: string, items: MediaFile[]): GalleryEntry {
  return {
    kind: "playlist",
    title,
    path: `/Playlists/${title}`,
    itemCount: items.length,
    combinedDuration: 0,
    stackThumbnailPath: null,
    items,
  };
}

describe("isAudioGalleryEntry", () => {
  it("treats mp3 media as audio", () => {
    expect(isAudioGalleryEntry(media("/lib/Music/song/track.mp3"))).toBe(true);
  });

  it("treats mp4 media as video", () => {
    expect(isAudioGalleryEntry(media("/lib/Videos/movie/video.mp4"))).toBe(false);
  });

  it("treats all-audio playlists as audio", () => {
    const items = [media("/lib/Playlists/a/01.mp3"), media("/lib/Playlists/a/02.mp3")];
    expect(isAudioGalleryEntry(playlist("Chill", items as MediaFile[]))).toBe(true);
  });

  it("keeps mixed playlists as non-audio", () => {
    const items = [media("/lib/Playlists/mix/01.mp3"), media("/lib/Playlists/mix/clip.mp4")];
    expect(isAudioGalleryEntry(playlist("Mix", items as MediaFile[]))).toBe(false);
  });
});

describe("filterMainLibraryEntries", () => {
  const rows: GalleryEntry[] = [
    media("/lib/Videos/a/video.mp4"),
    media("/lib/Music/b/song.mp3"),
    playlist("Songs", [media("/lib/Playlists/Songs/1.mp3") as MediaFile]),
  ];

  it("passes through everything when hideAudio is false", () => {
    expect(filterMainLibraryEntries(rows, false)).toHaveLength(3);
  });

  it("removes audio-only rows when hideAudio is true", () => {
    const out = filterMainLibraryEntries(rows, true);
    expect(out).toHaveLength(1);
    expect(out[0].kind === "media" && out[0].path).toContain("video.mp4");
  });
});

import { describe, expect, it } from "vitest";
import {
  mediaFileFromDownloadFinish,
  removePathFromGalleryEntries,
  upsertMediaIntoGalleryEntries,
} from "./galleryEntries";
import type { DownloadJob } from "./downloadQueue";
import type { GalleryEntry, MediaFile } from "./types";

function media(path: string, name = path): MediaFile {
  return {
    name,
    path,
    size: 1,
    created: 1,
    duration: 10,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
  };
}

describe("galleryEntries", () => {
  it("removes a flat media row by path", () => {
    const entries: GalleryEntry[] = [
      { ...media("a.mp4"), kind: "media" },
      { ...media("b.mp4"), kind: "media" },
    ];
    const next = removePathFromGalleryEntries(entries, "A.mp4");
    expect(next).toHaveLength(1);
    expect(next[0].kind === "media" && next[0].path).toBe("b.mp4");
  });

  it("removes an item from a playlist and drops empty playlists", () => {
    const entries: GalleryEntry[] = [
      {
        kind: "playlist",
        title: "P",
        path: "P",
        itemCount: 2,
        combinedDuration: 20,
        stackThumbnailPath: null,
        items: [media("a.mp3"), media("b.mp3")],
      },
    ];
    const afterOne = removePathFromGalleryEntries(entries, "a.mp3");
    expect(afterOne).toHaveLength(1);
    expect(afterOne[0].kind).toBe("playlist");
    if (afterOne[0].kind === "playlist") {
      expect(afterOne[0].items).toHaveLength(1);
      expect(afterOne[0].itemCount).toBe(1);
    }
    const afterAll = removePathFromGalleryEntries(afterOne, "b.mp3");
    expect(afterAll).toHaveLength(0);
  });

  it("upserts a new media row at the front", () => {
    const entries: GalleryEntry[] = [{ ...media("old.mp4"), kind: "media" }];
    const next = upsertMediaIntoGalleryEntries(entries, media("new.mp4", "New"));
    expect(next).toHaveLength(2);
    expect(next[0].kind === "media" && next[0].path).toBe("new.mp4");
  });

  it("builds a MediaFile from a finish payload with outputPath", () => {
    const job = {
      id: "dl-1",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      title: "Song",
      metadata: {
        title: "Song",
        thumbnail: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
        duration: 120,
        isPlaylist: false,
        fileSizeBytes: 1000,
      },
      status: "downloading",
      approval: "auto",
      progress: null,
      error: null,
      options: { audioOnly: true, outputDir: "D:\\out", format: "bestaudio/best" },
      createdAt: 1,
      resumeOnStart: false,
    } as unknown as DownloadJob;
    const file = mediaFileFromDownloadFinish(
      "D:\\out\\Song.m4a",
      job,
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
    expect(file).not.toBeNull();
    expect(file?.path).toBe("D:\\out\\Song.m4a");
    expect(file?.name).toBe("Song");
    expect(file?.sourceId).toBe("abcdefghijk");
    expect(mediaFileFromDownloadFinish(undefined, job, job.url)).toBeNull();
  });
});

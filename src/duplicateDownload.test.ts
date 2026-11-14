import { describe, expect, it } from "vitest";
import { findLibraryMatchForPlaylistItem } from "./duplicateDownload";
import type { GalleryEntry, MediaFile, PlaylistItem } from "./types";

const file = (over: Partial<MediaFile>): GalleryEntry =>
  ({
    kind: "media",
    path: "D:/lib/Intro.mp4",
    name: "Intro",
    duration: 120,
    ...over,
  }) as unknown as GalleryEntry;

const item = (over: Partial<PlaylistItem>): PlaylistItem => ({
  title: "Intro",
  thumbnail: "",
  duration: 120,
  ...over,
});

describe("playlist row to library match", () => {
  it("never matches on title alone", () => {
    expect(findLibraryMatchForPlaylistItem(item({ duration: 0 }), [file({})])).toBeNull();
  });

  it("matches the same title within 2 seconds", () => {
    const hit = findLibraryMatchForPlaylistItem(item({ duration: 122 }), [file({})]);
    expect(hit?.matchedVia).toBe("title");
  });

  it("rejects the same title with a different length", () => {
    expect(findLibraryMatchForPlaylistItem(item({ duration: 125 }), [file({})])).toBeNull();
  });

  it("finds the right file among same-titled ones", () => {
    const entries = [file({ path: "D:/a/Intro.mp4", duration: 300 }), file({ path: "D:/b/Intro.mp4" })];
    expect(findLibraryMatchForPlaylistItem(item({}), entries)?.file.path).toBe("D:/b/Intro.mp4");
  });

  it("still matches by video id first", () => {
    const entries = [file({ sourceId: "abcdefghijk", duration: 5 })];
    const hit = findLibraryMatchForPlaylistItem(item({ id: "abcdefghijk", duration: 999 }), entries);
    expect(hit?.matchedVia).toBe("source_id");
  });
});

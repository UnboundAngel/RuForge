import { describe, expect, it } from "vitest";
import type { GalleryEntry, MediaFile } from "@/types";
import {
  findKnownMediaFile,
  isLocalAbsoluteMediaPath,
  isLocalMediaFilePayload,
  isTrustedExplorerUrl,
} from "./trustedMediaPath";

function media(path: string): MediaFile {
  return {
    name: path.split(/[\\/]/).pop() ?? path,
    path,
    size: 1,
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

describe("isLocalAbsoluteMediaPath", () => {
  it("rejects UNC, device, relative and non-string paths", () => {
    for (const p of [
      "\\\\192.0.2.10\\s\\x.mp4",
      "//attacker/share/x.mp4",
      "\\\\?\\C:\\x.mp4",
      "\\\\.\\pipe\\x",
      "Videos\\x.mp4",
      "",
      42,
      null,
    ]) {
      expect(isLocalAbsoluteMediaPath(p)).toBe(false);
    }
  });

  it("accepts drive and POSIX absolute paths", () => {
    expect(isLocalAbsoluteMediaPath("C:\\Media\\a.mp4")).toBe(true);
    expect(isLocalAbsoluteMediaPath("D:/Media/a.mp4")).toBe(true);
    expect(isLocalAbsoluteMediaPath("/home/u/a.mp4")).toBe(true);
  });
});

describe("isLocalMediaFilePayload", () => {
  it("rejects a local file whose sidecar paths point at a share", () => {
    expect(isLocalMediaFilePayload(media("C:\\M\\a.mp4"))).toBe(true);
    expect(isLocalMediaFilePayload({ ...media("C:\\M\\a.mp4"), subtitlePath: "\\\\h\\s\\a.vtt" })).toBe(false);
    expect(isLocalMediaFilePayload({ ...media("C:\\M\\a.mp4"), scrubSpritePaths: ["//h/s/1.jpg"] })).toBe(false);
    expect(isLocalMediaFilePayload(media("\\\\h\\s\\a.mp4"))).toBe(false);
  });
});

describe("findKnownMediaFile", () => {
  const lib = media("C:\\Media\\Videos\\a\\a.mp4");
  const item = media("C:\\Media\\Playlists\\p\\01.mp4");
  const entries: GalleryEntry[] = [
    { ...lib, kind: "media" },
    {
      kind: "playlist",
      title: "p",
      path: "C:\\Media\\Playlists\\p",
      itemCount: 1,
      combinedDuration: 0,
      stackThumbnailPath: null,
      items: [item],
    },
  ];

  it("returns main's own copy for known paths, matching slashes and case", () => {
    expect(findKnownMediaFile("c:/media/videos/a/a.mp4", { entries, files: [] })).toBe(entries[0]);
    expect(findKnownMediaFile(item.path, { entries, files: [] })).toBe(item);
  });

  it("rejects unknown and UNC paths", () => {
    expect(findKnownMediaFile("C:\\Other\\x.mp4", { entries, files: [] })).toBeNull();
    expect(findKnownMediaFile("\\\\192.0.2.10\\s\\a.mp4", { entries, files: [] })).toBeNull();
  });
});

describe("isTrustedExplorerUrl", () => {
  it("only accepts https YouTube pages", () => {
    expect(isTrustedExplorerUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isTrustedExplorerUrl("https://music.youtube.com/")).toBe(true);
    expect(isTrustedExplorerUrl("javascript:alert(1)")).toBe(false);
    expect(isTrustedExplorerUrl("file:///C:/Windows")).toBe(false);
    expect(isTrustedExplorerUrl("http://www.youtube.com/")).toBe(false);
    expect(isTrustedExplorerUrl("https://youtube.com.evil.test/")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { GalleryEntry, MediaFile } from "@/types";
import { videoItemKey } from "@/lib/playlistSession/itemKey";
import {
  DEMO_PLAYLIST_PATH,
  buildDemoPlaylist,
  isDemoPlaylistPath,
  pickDemoItems,
  reorderDemoItems,
  shouldShowDemoPlaylist,
} from "./onboardingMockPlaylists";

function file(n: number, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name: `video-${n}.mp4`,
    path: `C:\lib\video-${n}.mp4`,
    size: 1,
    created: 1000 + n,
    duration: 100 + n,
    thumbnailPath: `C:\lib\t${n}.jpg`,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: `id${n}`,
    ...extra,
  };
}

function playlist(items: MediaFile[]): GalleryEntry {
  return { kind: "playlist", title: "p", path: "ruforge-virtual://p", itemCount: items.length, combinedDuration: 0, stackThumbnailPath: null, items };
}

describe("pickDemoItems", () => {
  it("uses placeholders without sourceId when the library is small", () => {
    const items = pickDemoItems([file(1), file(2), file(3)], 5000);
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((f) => f.sourceId === null && f.sourceUrl === null && f.thumbnailPath === null)).toBe(true);
    expect(new Set(items.map(videoItemKey)).size).toBe(items.length);
  });

  it("uses the newest real videos once there are four", () => {
    const lib = [1, 2, 3, 4, 5, 6, 7].map((n) => file(n));
    const items = pickDemoItems(lib);
    expect(items).toHaveLength(5);
    expect(items[0].name).toBe("video-7.mp4");
  });

  it("ignores audio files", () => {
    const lib = [1, 2, 3].map((n) => file(n)).concat([4, 5].map((n) => file(n, { name: `a${n}.mp3`, path: `C:\lib\a${n}.mp3` })));
    expect(pickDemoItems(lib, 5000)[0].path.startsWith("ruforge-demo://")).toBe(true);
  });
});

describe("shouldShowDemoPlaylist", () => {
  const real = [playlist([file(1), file(2), file(3)])];
  it("needs the video-playlists mock", () => {
    expect(shouldShowDemoPlaylist({ kind: null, forced: true }, [])).toBe(false);
  });
  it("shows with no real playlist, or a real one under three videos", () => {
    expect(shouldShowDemoPlaylist({ kind: "video-playlists", forced: false }, [])).toBe(true);
    expect(shouldShowDemoPlaylist({ kind: "video-playlists", forced: false }, [playlist([file(1)])])).toBe(true);
  });
  it("hides over a real playlist of three videos unless forced", () => {
    expect(shouldShowDemoPlaylist({ kind: "video-playlists", forced: false }, real)).toBe(false);
    expect(shouldShowDemoPlaylist({ kind: "video-playlists", forced: true }, real)).toBe(true);
  });
});

describe("demo playlist", () => {
  it("builds a collection on the demo path", () => {
    const items = pickDemoItems([], 5000);
    const p = buildDemoPlaylist(items);
    expect(isDemoPlaylistPath(p.path)).toBe(true);
    expect(p.path).toBe(DEMO_PLAYLIST_PATH);
    expect(p.itemCount).toBe(items.length);
    expect(p.combinedDuration).toBe(items.reduce((s, f) => s + f.duration, 0));
  });

  it("reorders like the real list and leaves the input alone", () => {
    const items = pickDemoItems([], 5000);
    const next = reorderDemoItems(items, videoItemKey(items[2]), videoItemKey(items[0]));
    expect(next[0]).toBe(items[2]);
    expect(next[1]).toBe(items[0]);
    expect(items[0].path).toBe("ruforge-demo://clip-1.mp4");
  });
});

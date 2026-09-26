import { describe, expect, it, beforeEach, vi } from "vitest";
import type { GalleryEntry, MediaFile } from "./types";
import {
  WATCH_LATER_ID,
  addPathsToRecord,
  createVirtualPlaylistRecord,
  hydrateVirtualPlaylist,
  loadVirtualPlaylistRecords,
  nextDefaultPlaylistTitle,
  reorderRecordByPath,
  saveVirtualPlaylistRecords,
  mergeVirtualPlaylistsIntoEntries,
  moveRecordItem,
  pathInWatchLater,
  reorderRecordItems,
  stripVirtualPlaylists,
  virtualPlaylistPath,
} from "./virtualPlaylists";

let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
});

function media(path: string, created = 1): MediaFile {
  return {
    name: path.split(/[/\\]/).pop() || path,
    path,
    size: 100,
    created,
    duration: 60,
    thumbnailPath: null,
    ruforgePosterPath: null,
    subtitlePath: null,
    chapters: null,
    downloadMetadataHint: null,
    sourceUrl: null,
    sourceId: null,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("virtualPlaylists", () => {
  it("creates watch-later path and hydrates ordered items", () => {
    const record = createVirtualPlaylistRecord("Farms", [
      "C:\\a\\one.mp4",
      "C:\\a\\two.mp4",
    ]);
    const index = new Map([
      ["c:\\a\\two.mp4", media("C:\\a\\two.mp4")],
      ["c:\\a\\one.mp4", media("C:\\a\\one.mp4")],
    ]);
    const playlist = hydrateVirtualPlaylist(record, index);
    expect(playlist.path).toBe(virtualPlaylistPath(record.id));
    expect(playlist.items.map((i) => i.path)).toEqual([
      "C:\\a\\one.mp4",
      "C:\\a\\two.mp4",
    ]);
    expect(playlist.itemCount).toBe(2);
  });

  it("merges virtual stacks ahead of disk entries and keeps Watch later", () => {
    const disk: GalleryEntry[] = [
      { ...media("C:\\v\\solo.mp4"), kind: "media" },
      {
        kind: "playlist",
        title: "Disk batch",
        path: "C:\\Playlists\\batch",
        itemCount: 1,
        combinedDuration: 60,
        stackThumbnailPath: null,
        items: [media("C:\\Playlists\\batch\\a.mp4")],
      },
    ];
    const wl = {
      id: WATCH_LATER_ID,
      title: "Watch later",
      items: [{ path: "C:\\v\\solo.mp4", addedAt: 1 }],
      thumbnailPath: null,
      updatedAt: 10,
      system: true as const,
    };
    const merged = mergeVirtualPlaylistsIntoEntries(disk, [wl]);
    expect(merged[0]?.kind).toBe("playlist");
    if (merged[0]?.kind === "playlist") {
      expect(merged[0].path).toBe(virtualPlaylistPath(WATCH_LATER_ID));
      expect(merged[0].items[0]?.path).toBe("C:\\v\\solo.mp4");
    }
    expect(stripVirtualPlaylists(merged).some((e) => e.kind === "media")).toBe(true);
  });

  it("reorders and moves items", () => {
    let record = createVirtualPlaylistRecord("X", ["a", "b", "c"]);
    record = reorderRecordItems(record, 0, 2);
    expect(record.items.map((i) => i.path)).toEqual(["b", "c", "a"]);
    record = moveRecordItem(record, "c", "top");
    expect(record.items.map((i) => i.path)).toEqual(["c", "b", "a"]);
  });

  it("tracks Watch later membership after add", () => {
    const record = addPathsToRecord(
      {
        id: WATCH_LATER_ID,
        title: "Watch later",
        items: [],
        updatedAt: 1,
        system: true,
      },
      ["C:\\x\\y.mp4"],
    );
    expect(pathInWatchLater("C:\\x\\y.mp4", [record])).toBe(true);
    expect(pathInWatchLater("C:\\x\\z.mp4", [record])).toBe(false);
  });
});

describe("music playlists", () => {
  it("numbers default titles past the highest existing one", () => {
    const a = createVirtualPlaylistRecord("My Playlist #1", [], 1, "music");
    const b = createVirtualPlaylistRecord("My Playlist #4", [], 1, "music");
    const c = createVirtualPlaylistRecord("Road trip", [], 1, "music");
    expect(nextDefaultPlaylistTitle([])).toBe("My Playlist #1");
    expect(nextDefaultPlaylistTitle([a, b, c])).toBe("My Playlist #5");
  });

  it("keeps kind through a localStorage round trip and defaults old records to video", () => {
    const music = createVirtualPlaylistRecord("Mix", ["C:\\m\\a.mp3"], 1, "music");
    const legacy = { ...createVirtualPlaylistRecord("Old", [], 1), kind: undefined };
    saveVirtualPlaylistRecords([music, legacy]);
    const loaded = loadVirtualPlaylistRecords();
    expect(loaded.find((r) => r.id === music.id)?.kind).toBe("music");
    expect(loaded.find((r) => r.id === legacy.id)?.kind).toBe("video");
    expect(loaded.find((r) => r.id === WATCH_LATER_ID)?.kind).toBe("video");
  });

  it("reorders by path and ignores unknown paths", () => {
    const r = createVirtualPlaylistRecord("Mix", ["C:\\a.mp3", "C:\\gone.mp3", "C:\\b.mp3"], 1, "music");
    const moved = reorderRecordByPath(r, "C:\\b.mp3", "C:\\a.mp3", 2);
    expect(moved.items.map((i) => i.path)).toEqual(["C:\\b.mp3", "C:\\a.mp3", "C:\\gone.mp3"]);
    expect(reorderRecordByPath(r, "C:\\nope.mp3", "C:\\a.mp3")).toBe(r);
  });
});

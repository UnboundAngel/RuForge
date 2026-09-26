import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import {
  DEFAULT_PLAYLIST_VIEW_PREFS,
  filterPlaylistTracks,
  formatDateAdded,
  nextSortOnHeaderClick,
  sortPlaylistTracks,
} from "./musicPlaylistSort";

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

const a = track("b song", { artist: "Zed", album: "Alpha", duration: 300 });
const b = track("a song", { artist: "Amy", album: "Gamma", duration: 100 });
const c = track("c song", { artist: "Mo", album: "Beta", duration: 200 });
const record: VirtualPlaylistRecord = {
  id: "p",
  title: "P",
  kind: "music",
  updatedAt: 1,
  items: [
    { path: a.path, addedAt: 30 },
    { path: b.path, addedAt: 10 },
    { path: c.path, addedAt: 20 },
  ],
};
const tracks = [a, b, c];

describe("sortPlaylistTracks", () => {
  it("keeps record order for custom", () => {
    expect(sortPlaylistTracks(tracks, record, "custom", false)).toEqual([a, b, c]);
  });

  it("sorts by title, artist, album, date added, and duration", () => {
    expect(sortPlaylistTracks(tracks, record, "title", false)).toEqual([b, a, c]);
    expect(sortPlaylistTracks(tracks, record, "artist", false)).toEqual([b, c, a]);
    expect(sortPlaylistTracks(tracks, record, "album", false)).toEqual([a, c, b]);
    expect(sortPlaylistTracks(tracks, record, "added", false)).toEqual([b, c, a]);
    expect(sortPlaylistTracks(tracks, record, "duration", true)).toEqual([a, c, b]);
  });
});

describe("nextSortOnHeaderClick", () => {
  it("cycles ascending, descending, then custom", () => {
    const one = nextSortOnHeaderClick(DEFAULT_PLAYLIST_VIEW_PREFS, "title");
    expect(one).toMatchObject({ sort: "title", desc: false });
    const two = nextSortOnHeaderClick(one, "title");
    expect(two).toMatchObject({ sort: "title", desc: true });
    expect(nextSortOnHeaderClick(two, "title")).toMatchObject({ sort: "custom", desc: false });
  });
});

describe("filterPlaylistTracks", () => {
  it("matches title, artist, and album, and returns everything for an empty query", () => {
    expect(filterPlaylistTracks(tracks, "")).toBe(tracks);
    expect(filterPlaylistTracks(tracks, "amy")).toEqual([b]);
    expect(filterPlaylistTracks(tracks, "beta")).toEqual([c]);
  });
});

describe("formatDateAdded", () => {
  it("is relative for a month, then a full date", () => {
    const now = Date.UTC(2026, 8, 26, 12);
    expect(formatDateAdded(now - 30_000, now)).toBe("just now");
    expect(formatDateAdded(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(formatDateAdded(now - 3_600_000, now)).toBe("1 hour ago");
    expect(formatDateAdded(now - 3 * 86_400_000, now)).toBe("3 days ago");
    expect(formatDateAdded(now - 15 * 86_400_000, now)).toBe("2 weeks ago");
    expect(formatDateAdded(now - 90 * 86_400_000, now)).toMatch(/2026/);
  });
});

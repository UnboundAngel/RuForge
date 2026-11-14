import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import type { VirtualPlaylistRecord } from "@/virtualPlaylists";
import { buildMultiTrackAlbumGroups, fileHasBrowsableAlbum } from "@/components/music/musicShelfDedup";
import { removeRecordForDelete, syncDownloadedMusicPlaylists } from "./downloadedMusicPlaylists";

function track(path: string, artist: string, album: string, playlistIndex?: number): MediaFile {
  return {
    path,
    name: path.split("\\").pop()!,
    artist,
    album,
    playlistIndex,
    size: 0,
    created: 1_700_000_000,
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

const mix = [
  track("D:\\M\\Playlists\\HYPE GAMING MIX\\02 - b\\b.mp3", "Yeat", "HYPE GAMING MIX", 2),
  track("D:\\M\\Playlists\\HYPE GAMING MIX\\01 - a\\a.mp3", "2 Chainz", "HYPE GAMING MIX", 1),
  track("D:\\M\\Playlists\\HYPE GAMING MIX\\03 - c\\c.mp3", "Yeat", "HYPE GAMING MIX", 3),
  track("D:\\M\\Playlists\\HYPE GAMING MIX\\04 - d\\d.mp3", "2 Chainz", "HYPE GAMING MIX", 4),
];

describe("syncDownloadedMusicPlaylists", () => {
  it("creates one music playlist per downloaded folder, in playlist order", () => {
    const { records, changed } = syncDownloadedMusicPlaylists([], mix, 5);
    expect(changed).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ title: "HYPE GAMING MIX", kind: "music", sourceFolder: "hype gaming mix" });
    expect(records[0]!.items.map((i) => i.path.slice(-5))).toEqual(["a.mp3", "b.mp3", "c.mp3", "d.mp3"]);
  });

  it("tops up new tracks and leaves a synced record alone", () => {
    const first = syncDownloadedMusicPlaylists([], mix.slice(0, 2), 5).records;
    const second = syncDownloadedMusicPlaylists(first, mix, 6);
    expect(second.records[0]!.items).toHaveLength(4);
    expect(syncDownloadedMusicPlaylists(second.records, mix, 7).changed).toBe(false);
  });

  it("skips one-track folders", () => {
    expect(syncDownloadedMusicPlaylists([], mix.slice(0, 1)).changed).toBe(false);
  });

  it("a deleted downloaded playlist stays deleted", () => {
    const created = syncDownloadedMusicPlaylists([], mix).records;
    const afterDelete = removeRecordForDelete(created, created[0]!.id);
    expect(afterDelete[0]).toMatchObject({ dismissed: true, items: [] });
    expect(syncDownloadedMusicPlaylists(afterDelete, mix).changed).toBe(false);
  });

  it("removes ordinary playlists outright", () => {
    const plain = { id: "x", title: "Mine", items: [], updatedAt: 0, kind: "music" } as VirtualPlaylistRecord;
    expect(removeRecordForDelete([plain], "x")).toEqual([]);
  });
});

describe("playlist-stamped albums", () => {
  const primary = (raw: string) => raw;

  it("a mixed-artist playlist download forms no albums", () => {
    expect(buildMultiTrackAlbumGroups(mix, primary)).toEqual([]);
    expect(fileHasBrowsableAlbum(mix[0]!, mix)).toBe(false);
  });

  it("a single-artist playlist download is still an album", () => {
    const ost = [
      track("D:\\M\\Playlists\\Minecraft OST\\01\\a.mp3", "C418", "Minecraft OST", 1),
      track("D:\\M\\Playlists\\Minecraft OST\\02\\b.mp3", "C418", "Minecraft OST", 2),
    ];
    expect(buildMultiTrackAlbumGroups(ost, primary)).toHaveLength(1);
  });
});

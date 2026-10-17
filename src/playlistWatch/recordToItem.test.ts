import { describe, expect, it } from "vitest";
import { isPlaylistRecord, playlistToastCopy, recordToItem } from "./recordToItem";
import type { PlaylistNewRecord } from "./types";

const rec = (ids: string[], at = 100): PlaylistNewRecord => ({
  listId: "PLabcdefghijk",
  listUrl: "https://www.youtube.com/playlist?list=PLabcdefghijk",
  title: "Road",
  outputDir: "D:/out",
  folderName: "Road",
  videos: ids.map((id) => ({ id, title: `t-${id}` })),
  at,
});

describe("playlist watch records", () => {
  it("rejects empty or malformed records", () => {
    expect(isPlaylistRecord(rec([]))).toBe(false);
    expect(isPlaylistRecord(null)).toBe(false);
    expect(isPlaylistRecord({ listId: 1 })).toBe(false);
    expect(isPlaylistRecord(rec(["aaaaaaaaaaa"]))).toBe(true);
  });

  it("builds a queue row keyed by playlist", () => {
    const item = recordToItem(rec(["aaaaaaaaaaa"]));
    expect(item.id).toBe("playlist:PLabcdefghijk");
    expect(item.actions).toEqual(["queue"]);
    expect(item.createdAt).toBe(100_000);
    expect(item.ref.playlist?.folderName).toBe("Road");
  });

  it("folds a later batch into the existing row without duplicates", () => {
    const first = recordToItem(rec(["aaaaaaaaaaa", "bbbbbbbbbbb"]));
    const next = recordToItem(rec(["ccccccccccc", "bbbbbbbbbbb"], 200), first);
    expect(next.ref.playlist?.videos.map((v) => v.id)).toEqual(["ccccccccccc", "bbbbbbbbbbb", "aaaaaaaaaaa"]);
    expect(next.subtitle).toContain("3 new videos");
  });

  it("words the toast by count", () => {
    expect(playlistToastCopy(rec(["aaaaaaaaaaa"]))).toBe("1 new video in Road");
    expect(playlistToastCopy(rec(["aaaaaaaaaaa", "bbbbbbbbbbb"]))).toBe("2 new videos in Road");
  });
});

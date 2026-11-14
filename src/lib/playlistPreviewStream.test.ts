import { describe, expect, it } from "vitest";
import type { PlaylistItem } from "@/types";
import { mergePlaylistBatch } from "./playlistPreviewStream";

const row = (id: string, duration: number, thumbnail = ""): PlaylistItem => ({ id, title: id, thumbnail, duration });

describe("mergePlaylistBatch", () => {
  it("creates the info from the first page and appends later pages", () => {
    const first = mergePlaylistBatch(null, [row("a", 10, "t.jpg"), row("b", 20)], {
      title: " My list ",
    } as never);
    expect(first.title).toBe("My list");
    expect(first.thumbnail).toBe("t.jpg");
    expect(first.duration).toBe(30);
    const next = mergePlaylistBatch(first, [row("c", 5)], null);
    expect(next.playlistItems?.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(next.duration).toBe(35);
    expect(next.title).toBe("My list");
    expect(next.isPlaylist).toBe(true);
  });
});

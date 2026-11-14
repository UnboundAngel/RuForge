import { describe, expect, it } from "vitest";
import {
  insertRecordItem,
  nextVideoPlaylistTitle,
  relocateRecordItem,
  scanPlaylistDuplicates,
} from "./playlistRecordOps";
import type { VirtualPlaylistRecord } from "../virtualPlaylists";

const record = (...paths: string[]): VirtualPlaylistRecord => ({
  id: "r",
  title: "T",
  updatedAt: 1,
  items: paths.map((path, i) => ({ path, addedAt: i })),
});

describe("nextVideoPlaylistTitle", () => {
  it("starts at Playlist 1", () => {
    expect(nextVideoPlaylistTitle([])).toBe("Playlist 1");
  });
  it("takes the lowest unused number", () => {
    expect(nextVideoPlaylistTitle([{ title: "Playlist 1" }, { title: "Playlist 3" }])).toBe("Playlist 2");
  });
  it("counts a bare Playlist as 1 and ignores other names", () => {
    expect(nextVideoPlaylistTitle([{ title: "Playlist" }, { title: "Mixes" }])).toBe("Playlist 2");
  });
});

describe("scanPlaylistDuplicates", () => {
  const keyOf = (p: string) => (p.includes("dup") ? "yt:1" : p.includes("other") ? "yt:2" : null);
  it("splits same-path and same-video hits", () => {
    const r = record("C:\\a\\dup1.mp4");
    const out = scanPlaylistDuplicates(r, ["C:\\a\\dup1.mp4", "D:\\b\\dup2.mp4", "C:\\a\\other.mp4"], keyOf);
    expect(out.samePath).toEqual(["C:\\a\\dup1.mp4"]);
    expect(out.sameVideo).toEqual(["D:\\b\\dup2.mp4"]);
  });
  it("finds nothing in an empty playlist", () => {
    expect(scanPlaylistDuplicates(record(), ["C:\\x.mp4"], keyOf)).toEqual({ samePath: [], sameVideo: [] });
  });
});

describe("record edits", () => {
  it("puts a removed item back at its slot", () => {
    const r = record("a", "c");
    const out = insertRecordItem(r, { path: "b", addedAt: 5 }, 1);
    expect(out.items.map((i) => i.path)).toEqual(["a", "b", "c"]);
  });
  it("does not insert twice", () => {
    const r = record("a");
    expect(insertRecordItem(r, { path: "a", addedAt: 5 }, 0)).toBe(r);
  });
  it("relocates in place and drops the stale identity", () => {
    const r = record("a", "b");
    r.items[1].identityKey = "id:1";
    const out = relocateRecordItem(r, "b", "z");
    expect(out.items.map((i) => i.path)).toEqual(["a", "z"]);
    expect(out.items[1].identityKey).toBeUndefined();
  });
  it("merges into an existing entry when the new file is already listed", () => {
    const out = relocateRecordItem(record("a", "b"), "b", "a");
    expect(out.items.map((i) => i.path)).toEqual(["a"]);
  });
});

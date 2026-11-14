import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import { buildRows, moveInList, sortRows } from "./playlistRows";

function file(name: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name,
    path: `C:\\v\\${name}`,
    size: 1,
    created: 0,
    duration: 60,
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

const rec = (...paths: string[]) => ({
  items: paths.map((path, i) => ({ path, addedAt: (i + 1) * 100 })),
});

describe("buildRows", () => {
  it("follows the record order and marks lost files missing", () => {
    const a = file("a.mp4");
    const c = file("c.mp4");
    const rows = buildRows({ items: [a, c] }, rec(a.path, "C:\\v\\b.mp4", c.path));
    expect(rows.map((r) => r.type)).toEqual(["file", "missing", "file"]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it("uses scan order for folder playlists", () => {
    const rows = buildRows({ items: [file("x.mp4"), file("y.mp4")] }, undefined);
    expect(rows.map((r) => r.position)).toEqual([1, 2]);
  });
});

describe("sortRows", () => {
  const a = file("b.mp4", { duration: 10, youtube: { channelVerified: false, publishedAt: 5 } });
  const b = file("a.mp4", { duration: 30, youtube: { channelVerified: false, publishedAt: 9 } });
  const c = file("c.mp4", { duration: 20 });
  const rows = buildRows({ items: [a, b, c] }, rec(a.path, b.path, c.path, "C:\\v\\gone.mp4"));
  const names = (m: Parameters<typeof sortRows>[1]) =>
    sortRows(rows, m).map((r) => (r.type === "file" ? r.file.name : "gone"));

  it("keeps playlist order by default", () => {
    expect(names("order")).toEqual(["b.mp4", "a.mp4", "c.mp4", "gone"]);
  });
  it("sorts by title, missing last", () => {
    expect(names("title")).toEqual(["a.mp4", "b.mp4", "c.mp4", "gone"]);
  });
  it("sorts longest first", () => {
    expect(names("duration")).toEqual(["a.mp4", "c.mp4", "b.mp4", "gone"]);
  });
  it("sorts newest upload first, unknown dates last", () => {
    expect(names("uploaded")).toEqual(["a.mp4", "b.mp4", "c.mp4", "gone"]);
  });
  it("sorts by date added, newest first", () => {
    expect(names("added")).toEqual(["c.mp4", "a.mp4", "b.mp4", "gone"]);
  });
  it("does not change the playlist positions", () => {
    const sorted = sortRows(rows, "title");
    expect(sorted.find((r) => r.type === "file" && r.file.name === "a.mp4")?.position).toBe(2);
  });
});

describe("moveInList", () => {
  it("moves an item and clamps the target", () => {
    expect(moveInList([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveInList([1, 2, 3], 2, 99)).toEqual([1, 2, 3]);
    expect(moveInList([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
  });
});

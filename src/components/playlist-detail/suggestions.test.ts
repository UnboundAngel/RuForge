import { describe, expect, it } from "vitest";
import type { MediaFile } from "@/types";
import { suggestVideos } from "./suggestions";

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
const yt = (channelId: string) => ({ channelId, channelVerified: false });

describe("suggestVideos", () => {
  it("skips what the playlist already has, by path and by video id", () => {
    const held = file("a.mp4", { sourceId: "abc" });
    const sameVideo = file("a-again.mp4", { sourceId: "abc" });
    const fresh = file("b.mp4");
    const out = suggestVideos([held], [held, sameVideo, fresh], () => false);
    expect(out.map((f) => f.name)).toEqual(["b.mp4"]);
  });

  it("puts videos from the playlist's channels first", () => {
    const held = file("a.mp4", { youtube: yt("c1") });
    const same = file("same.mp4", { youtube: yt("c1"), created: 1 });
    const other = file("other.mp4", { youtube: yt("c2"), created: 9 });
    const out = suggestVideos([held], [other, same], () => false);
    expect(out.map((f) => f.name)).toEqual(["same.mp4", "other.mp4"]);
  });

  it("prefers unwatched, then newest, and honours the limit", () => {
    const watched = file("w.mp4", { created: 99 });
    const a = file("a.mp4", { created: 1 });
    const b = file("b.mp4", { created: 2 });
    const out = suggestVideos([], [watched, a, b], (f) => f.name === "w.mp4", 2);
    expect(out.map((f) => f.name)).toEqual(["b.mp4", "a.mp4"]);
  });
});

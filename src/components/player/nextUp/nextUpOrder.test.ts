import { describe, expect, it } from "vitest";
import type { MediaFile } from "../../../types";
import { buildNextUpOrder, hasChannelData, sortNextUpItems } from "./nextUpOrder";

function item(name: string, extra: Partial<MediaFile> = {}): MediaFile {
  return {
    name,
    path: `D:/m/${name}`,
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
    ...extra,
  };
}

const a = item("a.mp4", { created: 300, duration: 50, youtube: { channel: "Zed", channelVerified: false, publishedAt: 100 } });
const b = item("b.mp4", { created: 100, duration: 10, youtube: { channel: "alpha", channelVerified: false, publishedAt: 900 } });
const c = item("c.mp4", { created: 200, duration: 30 });
const d = item("d.mp4", { created: 200, duration: 30 });
const folder = [a, b, c, d];

describe("buildNextUpOrder", () => {
  it("lists items after the current one and drops the earlier ones when playback stops", () => {
    const o = buildNextUpOrder(folder, b.path, false);
    expect(o.current).toBe(b);
    expect(o.upNext).toEqual([c, d]);
    expect(o.earlier).toEqual([]);
  });

  it("adds the earlier items only when playback wraps", () => {
    const o = buildNextUpOrder(folder, c.path, true);
    expect(o.upNext).toEqual([d]);
    expect(o.earlier).toEqual([a, b]);
  });

  it("is empty after the last item", () => {
    const o = buildNextUpOrder(folder, d.path, false);
    expect(o.upNext).toEqual([]);
    expect(o.earlier).toEqual([]);
  });

  it("shows the whole list when the current file is not in it", () => {
    const o = buildNextUpOrder(folder, "D:/other.mp4", true);
    expect(o.current).toBeNull();
    expect(o.upNext).toEqual(folder);
  });
});

describe("sortNextUpItems", () => {
  it("keeps folder order and does not mutate the input", () => {
    const input = [...folder];
    expect(sortNextUpItems(input, "folder")).toEqual(folder);
    expect(input).toEqual(folder);
  });

  it("sorts by published date, falling back to file date, newest first", () => {
    expect(sortNextUpItems(folder, "newest")).toEqual([b, c, d, a]);
  });

  it("sorts oldest first", () => {
    expect(sortNextUpItems(folder, "oldest")).toEqual([a, c, d, b]);
  });

  it("sorts by duration with folder order breaking ties", () => {
    expect(sortNextUpItems(folder, "shortest")).toEqual([b, c, d, a]);
    expect(sortNextUpItems(folder, "longest")).toEqual([a, c, d, b]);
  });

  it("sorts channels case-insensitively with channel-less items last", () => {
    expect(sortNextUpItems(folder, "channel")).toEqual([b, a, c, d]);
  });
});

describe("hasChannelData", () => {
  it("needs two channeled items", () => {
    expect(hasChannelData(folder)).toBe(true);
    expect(hasChannelData([a, c, d])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { creatorFiles, creatorSections } from "./creatorSections";
import type { FeedVideo } from "./youtubeFeed";

const video = (id: string, viewCount: number | null = null, short = false): FeedVideo => ({
  videoId: id,
  title: id,
  url: `https://www.youtube.com/watch?v=${id}`,
  channel: "Dan",
  channelId: "UC1",
  channelVerified: false,
  thumbnail: null,
  duration: null,
  viewCount,
  timestamp: null,
  short,
});

describe("creatorSections", () => {
  it("drops downloads and Shorts, and ranks popular by views", () => {
    const recent = [video("a", 10), video("b", 500), video("own", 9000), video("s", 1e6, true), video("c", 80)];
    const out = creatorSections(recent, [video("w"), video("w"), video("own")], new Set(["own"]), 2);
    expect(out.latest.map((v) => v.videoId)).toEqual(["a", "b", "c"]);
    expect(out.popular.map((v) => v.videoId)).toEqual(["b", "c"]);
    expect(out.watched.map((v) => v.videoId)).toEqual(["w"]);
  });

  it("hides popular when views are missing", () => {
    expect(creatorSections([video("a"), video("b", 3)], [], new Set(), 4).popular).toEqual([]);
  });
});

describe("creatorFiles", () => {
  it("matches by channel id, or by name for files without one", () => {
    const files = [
      { id: 1, youtube: { channelId: "UC1", channel: "Dan" } },
      { id: 2, youtube: { channelId: "UC2", channel: "Dan" } },
      { id: 3, youtube: { channelId: null, channel: " dan " } },
      { id: 4, youtube: null },
    ];
    expect(creatorFiles(files, "UC1", "Dan").map((f) => f.id)).toEqual([1, 3]);
  });
});

import { describe, expect, it } from "vitest";
import { creatorFiles, creatorMeta, creatorPlaylists, creatorSections, creatorTabs } from "./creatorSections";
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
    const out = creatorSections(recent, [video("w"), video("w"), video("own")], new Set(["own"]));
    expect(out.uploads.map((v) => v.videoId)).toEqual(["a", "b", "c"]);
    expect(out.latest.map((v) => v.videoId)).toEqual(["a", "b", "c"]);
    expect(out.popular.map((v) => v.videoId)).toEqual(["b", "c", "a"]);
    expect(out.watched.map((v) => v.videoId)).toEqual(["w"]);
  });

  it("hides popular when views are missing", () => {
    expect(creatorSections([video("a"), video("b", 3)], [], new Set()).popular).toEqual([]);
  });

  it("caps shelves but keeps every upload for the Videos tab", () => {
    const recent = Array.from({ length: 30 }, (_, i) => video(`v${i}`, i));
    const out = creatorSections(recent, [], new Set());
    expect(out.uploads).toHaveLength(30);
    expect(out.latest).toHaveLength(18);
    expect(out.popular).toHaveLength(8);
    expect(out.popular[0].videoId).toBe("v29");
  });
});

const file = (id: number, channelId: string | null, channel = "Dan") => ({ id, youtube: { channelId, channel } });

describe("creatorFiles", () => {
  it("matches by channel id, or by name for files without one", () => {
    const files = [file(1, "UC1"), file(2, "UC2"), file(3, null, " dan "), { id: 4, youtube: null }];
    expect(creatorFiles(files, "UC1", "Dan").map((f) => f.id)).toEqual([1, 3]);
  });
});

describe("creatorPlaylists", () => {
  it("keeps playlists that are mostly this creator", () => {
    const playlists = [
      { name: "mine", items: [file(1, "UC1"), file(2, "UC1"), file(3, "UC2")] },
      { name: "mix", items: [file(1, "UC1"), file(2, "UC2"), file(3, "UC3"), file(4, "UC4")] },
      { name: "one", items: [file(1, "UC1")] },
      { name: "half", items: [file(1, "UC1"), file(2, null, "dan"), file(3, "UC2"), file(4, "UC3")] },
    ];
    expect(creatorPlaylists(playlists, "UC1", "Dan").map((p) => p.name)).toEqual(["mine", "half"]);
  });
});

describe("creatorTabs", () => {
  it("hides tabs with nothing behind them", () => {
    expect(creatorTabs({ downloaded: 0, playlists: 0 })).toEqual(["home", "videos"]);
    expect(creatorTabs({ downloaded: 3, playlists: 1 })).toEqual(["home", "videos", "downloaded", "playlists"]);
  });
});

describe("creatorMeta", () => {
  it("joins what's known and skips the rest", () => {
    const profile = { handle: "@dan", subscribers: "1.2M subscribers", videoCount: null };
    expect(creatorMeta(profile, 4)).toEqual(["@dan", "1.2M subscribers", "4 in your library"]);
    expect(creatorMeta(undefined, 0)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { composeChannelShelf, pickChannelVideos, pickLatestFollow, watchedFromChannel } from "./channelShelf";
import type { FeedVideo } from "./youtubeFeed";

const video = (id: string, viewCount: number | null = null, extra: Partial<FeedVideo> = {}): FeedVideo => ({
  videoId: id,
  title: id,
  url: `https://www.youtube.com/watch?v=${id}`,
  channel: "Dan Dingle",
  channelId: "UC1",
  channelVerified: false,
  thumbnail: null,
  duration: null,
  viewCount,
  timestamp: null,
  ...extra,
});

describe("pickChannelVideos", () => {
  it("takes newest, most viewed and watched in turns, skipping repeats, Shorts and the library", () => {
    const recent = [video("new1", 10), video("new2", 900), video("new3", 50), video("new4", 5000), video("s", 1e6, { short: true })];
    const watched = [video("old1"), video("new1")];
    const picked = pickChannelVideos(recent, watched, new Set(["new3"]), 5);
    expect(picked.map((v) => v.videoId)).toEqual(["new1", "new4", "old1", "new2"]);
  });

  it("stops at the count", () => {
    expect(pickChannelVideos([video("a"), video("b"), video("c")], [], new Set(), 2)).toHaveLength(2);
  });
});

describe("watchedFromChannel", () => {
  it("matches by id, or by name when history has no id", () => {
    const history = [
      video("a"),
      video("b", null, { channelId: null, channel: "dan dingle " }),
      video("c", null, { channelId: "UC2", channel: "Someone" }),
    ];
    expect(watchedFromChannel(history, "UC1", "Dan Dingle").map((v) => v.videoId)).toEqual(["a", "b"]);
  });
});

describe("pickLatestFollow", () => {
  const ch = (channelId: string, followedAt: number) => ({ channelId, title: channelId, followedAt });
  it("picks the newest follow that isn't already shelved", () => {
    expect(pickLatestFollow([ch("UC1", 1), ch("UC2", 3), ch("UC3", 2)], null)?.channelId).toBe("UC2");
    expect(pickLatestFollow([ch("UC1", 1), ch("UC2", 3)], "UC2")?.channelId).toBe("UC1");
    expect(pickLatestFollow([], null)).toBeNull();
  });
});

describe("composeChannelShelf", () => {
  it("keeps half the row for downloads when YouTube has plenty", () => {
    const items = composeChannelShelf(["f1", "f2", "f3", "f4"], [video("a"), video("b"), video("c")], 4);
    expect(items.map((i) => (i.kind === "file" ? i.file : i.video.videoId))).toEqual(["f1", "f2", "a", "b"]);
  });

  it("lets downloads fill what YouTube can't", () => {
    const items = composeChannelShelf(["f1", "f2", "f3", "f4"], [video("a")], 4);
    expect(items.map((i) => (i.kind === "file" ? i.file : i.video.videoId))).toEqual(["f1", "f2", "f3", "a"]);
  });
});

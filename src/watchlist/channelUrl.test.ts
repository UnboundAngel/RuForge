import { describe, expect, it } from "vitest";
import { explorerChannelRef, findFollowed } from "./channelUrl";
import type { WatchedChannel, WatchlistSnapshot } from "./types";

const UC = "UCabcdefghijklmnopqrstuv";

describe("explorerChannelRef", () => {
  it.each([
    [`https://www.youtube.com/channel/${UC}`, { kind: "id", channelId: UC }],
    [`https://www.youtube.com/channel/${UC}/videos?view=0`, { kind: "id", channelId: UC }],
    ["https://www.youtube.com/@SomeName", { kind: "handle", handle: "@SomeName" }],
    ["https://m.youtube.com/@SomeName/videos", { kind: "handle", handle: "@SomeName" }],
    ["https://www.youtube.com/@%E3%81%82", { kind: "handle", handle: "@\u3042" }],
    ["https://www.youtube.com/c/Custom", { kind: "path", path: "/c/Custom" }],
    ["https://youtube.com/user/Legacy/featured", { kind: "path", path: "/user/Legacy" }],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30", { kind: "video", videoId: "dQw4w9WgXcQ" }],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", { kind: "video", videoId: "dQw4w9WgXcQ" }],
  ])("%s", (url, want) => {
    expect(explorerChannelRef(url)).toEqual(want);
  });

  it.each([
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/",
    "https://www.youtube.com/feed/subscriptions",
    "https://www.youtube.com/channel/UCshort",
    "https://www.youtube.com/@",
    "https://www.youtube.com/watch",
    "https://music.youtube.com/channel/" + UC,
    "https://example.com/@SomeName",
    "not a url",
  ])("rejects %s", (url) => {
    expect(explorerChannelRef(url)).toBeNull();
  });
});

describe("findFollowed", () => {
  const channel = (channelId: string, handle: string | null): WatchedChannel => ({
    channelId,
    title: channelId,
    handle,
    followedAt: 0,
    autoDownload: false,
    lastCheckedAt: null,
    lastError: null,
  });
  const snapshot: WatchlistSnapshot = {
    channels: [channel(UC, "@SomeName"), channel("UCzzzzzzzzzzzzzzzzzzzzzz", null)],
    uploads: [],
    unseenCount: 0,
    checkIntervalMin: 30,
  };

  it("matches ids and handles case-insensitively", () => {
    expect(findFollowed(snapshot, { kind: "id", channelId: UC })?.channelId).toBe(UC);
    expect(findFollowed(snapshot, { kind: "handle", handle: "@somename" })?.channelId).toBe(UC);
    expect(findFollowed(snapshot, { kind: "handle", handle: "@other" })).toBeNull();
  });

  it("needs the owner id for a watch page and cannot tell for custom paths", () => {
    const video = { kind: "video", videoId: "dQw4w9WgXcQ" } as const;
    expect(findFollowed(snapshot, video)).toBeNull();
    expect(findFollowed(snapshot, video, UC)?.channelId).toBe(UC);
    expect(findFollowed(snapshot, { kind: "path", path: "/c/Custom" })).toBeNull();
  });

  it("handles a missing snapshot or ref", () => {
    expect(findFollowed(null, { kind: "id", channelId: UC })).toBeNull();
    expect(findFollowed(snapshot, null)).toBeNull();
  });
});

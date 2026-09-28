import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { explorerChannelRef } from "./channelUrl";
import { followTooltip, followedForRef, refKey, rememberPageChannel } from "./explorerFollow";
import type { WatchedChannel, WatchlistSnapshot } from "./types";

const UC = "UCabcdefghijklmnopqrstuv";

const channel: WatchedChannel = {
  channelId: UC,
  title: "Some Name",
  handle: null,
  followedAt: 0,
  autoDownload: false,
  lastCheckedAt: null,
  lastError: null,
};

const snapshot: WatchlistSnapshot = { channels: [channel], uploads: [], unseenCount: 0, checkIntervalMin: 30 };

describe("refKey", () => {
  it("folds handle and path case", () => {
    expect(refKey({ kind: "handle", handle: "@Some" })).toBe(refKey({ kind: "handle", handle: "@some" }));
    expect(refKey({ kind: "path", path: "/c/Custom" })).toBe("path:/c/custom");
  });
});

describe("followedForRef", () => {
  it("matches an id page directly", () => {
    expect(followedForRef(snapshot, { kind: "id", channelId: UC }, null)).toBe(channel);
  });

  it("matches a watch page through the owner id", () => {
    const ref = explorerChannelRef("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(followedForRef(snapshot, ref, null)).toBeNull();
    expect(followedForRef(snapshot, ref, UC)).toBe(channel);
  });

  it("uses a remembered resolution for paths and handle-less follows", () => {
    const path = explorerChannelRef("https://www.youtube.com/c/Custom/videos");
    const handle = explorerChannelRef("https://www.youtube.com/@SomeName");
    expect(followedForRef(snapshot, path, null)).toBeNull();
    expect(followedForRef(snapshot, handle, null)).toBeNull();
    rememberPageChannel(path!, UC);
    rememberPageChannel(handle!, UC);
    expect(followedForRef(snapshot, path, null)).toBe(channel);
    expect(followedForRef(snapshot, explorerChannelRef("https://www.youtube.com/@somename/videos"), null)).toBe(
      channel,
    );
  });

  it("drops a remembered page once the channel is unfollowed", () => {
    const empty = { ...snapshot, channels: [] };
    expect(followedForRef(empty, explorerChannelRef("https://www.youtube.com/c/Custom"), null)).toBeNull();
  });
});

describe("followTooltip", () => {
  it("names the channel or falls back", () => {
    expect(followTooltip("Some Name", false)).toBe("Follow Some Name for new uploads");
    expect(followTooltip("Some Name", true)).toBe("Following Some Name. Click to unfollow");
    expect(followTooltip(null, false)).toBe("Follow this channel for new uploads");
  });
});

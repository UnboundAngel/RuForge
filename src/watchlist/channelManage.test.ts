import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedChannel, WatchedChannel, WatchlistSnapshot } from "./types";

const invoke = vi.fn();
const resolveChannel = vi.fn<(input: string) => Promise<ResolvedChannel>>();
const followChannel = vi.fn(async (_ch: ResolvedChannel) => ({}) as WatchlistSnapshot);
const unfollowChannel = vi.fn(async (_id: string) => ({}) as WatchlistSnapshot);
const setAutoDownload = vi.fn(async (_id: string, _on: boolean) => ({}) as WatchlistSnapshot);

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("./watchlistActions", () => ({
  resolveChannel: (input: string) => resolveChannel(input),
  followChannel: (ch: ResolvedChannel) => followChannel(ch),
  unfollowChannel: (id: string) => unfollowChannel(id),
  setAutoDownload: (id: string, on: boolean) => setAutoDownload(id, on),
}));

const { useWatchlistStore } = await import("./watchlistStore");
const { CHECK_NOW_COOLDOWN_MS, checkChannelsNow, errorText, followFromPanel, setChannelAutoDownload, useChannelsUiStore } =
  await import("./channelManage");
const { sortChannelsByTitle } = await import("./channelSort");

function channel(channelId: string, title: string): WatchedChannel {
  return { channelId, title, handle: null, followedAt: 0, autoDownload: false, lastCheckedAt: null, lastError: null };
}

function withChannels(channels: WatchedChannel[]): void {
  useWatchlistStore.setState({ snapshot: { channels, uploads: [], unseenCount: 0, checkIntervalMin: 30 } });
}

const alpha: ResolvedChannel = { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "Alpha", handle: "@alpha" };

describe("channel manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChannelsUiStore.setState({ followPending: false, followMessage: null, followSeq: 0, checkNowUntil: 0 });
    withChannels([]);
  });

  it("follows a resolved channel and bumps the clear signal", async () => {
    resolveChannel.mockResolvedValue(alpha);
    await followFromPanel("  https://www.youtube.com/@alpha  ");
    expect(resolveChannel).toHaveBeenCalledWith("https://www.youtube.com/@alpha");
    expect(followChannel).toHaveBeenCalledWith(alpha);
    const s = useChannelsUiStore.getState();
    expect(s.followPending).toBe(false);
    expect(s.followSeq).toBe(1);
    expect(s.followMessage).toEqual({ tone: "info", text: "Following Alpha." });
  });

  it("treats an existing follow as a no-op", async () => {
    withChannels([channel(alpha.channelId, "Alpha")]);
    resolveChannel.mockResolvedValue(alpha);
    await followFromPanel("@alpha");
    expect(followChannel).not.toHaveBeenCalled();
    expect(useChannelsUiStore.getState().followMessage?.text).toBe("Already following Alpha.");
  });

  it("shows Rust's error string and keeps the input", async () => {
    resolveChannel.mockRejectedValue("Paste a YouTube channel or video link.");
    await followFromPanel("nonsense");
    const s = useChannelsUiStore.getState();
    expect(s.followMessage).toEqual({ tone: "error", text: "Paste a YouTube channel or video link." });
    expect(s.followSeq).toBe(0);
  });

  it("ignores blank input", async () => {
    await followFromPanel("   ");
    expect(resolveChannel).not.toHaveBeenCalled();
  });

  it("only toggles channels that are followed", () => {
    setChannelAutoDownload("UCmissingmissingmissing0", true);
    expect(setAutoDownload).not.toHaveBeenCalled();
    withChannels([channel(alpha.channelId, "Alpha")]);
    setChannelAutoDownload(alpha.channelId, true);
    expect(setAutoDownload).toHaveBeenCalledWith(alpha.channelId, true);
  });

  it("holds Check now for the cooldown", async () => {
    invoke.mockResolvedValue(undefined);
    await checkChannelsNow(1_000);
    await checkChannelsNow(1_000 + CHECK_NOW_COOLDOWN_MS - 1);
    expect(invoke).toHaveBeenCalledTimes(1);
    await checkChannelsNow(1_000 + CHECK_NOW_COOLDOWN_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("releases the cooldown when the refresh fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockRejectedValue("poisoned");
    await checkChannelsNow(5_000);
    expect(useChannelsUiStore.getState().checkNowUntil).toBe(0);
    err.mockRestore();
  });

  it("sorts by title ignoring case", () => {
    const sorted = sortChannelsByTitle([channel("b", "beta"), channel("a", "Alpha"), channel("c", "Charlie")]);
    expect(sorted.map((c) => c.title)).toEqual(["Alpha", "beta", "Charlie"]);
  });

  it("reads error text from strings and Errors", () => {
    expect(errorText("nope", "fallback")).toBe("nope");
    expect(errorText(new Error("bad"), "fallback")).toBe("bad");
    expect(errorText({}, "fallback")).toBe("fallback");
  });
});

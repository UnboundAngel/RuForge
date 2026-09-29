import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { type FeedVideo, type VideoStats, applyVideoStats, feedCookieSource } from "./youtubeFeed";

export type ChannelVideosStatus = "loading" | "done" | "error";

type ChannelVideosState = {
  byChannel: Record<string, FeedVideo[]>;
  status: Record<string, ChannelVideosStatus>;
  history: FeedVideo[];
};

export const useChannelVideosStore = create<ChannelVideosState>(() => ({ byChannel: {}, status: {}, history: [] }));

const CHANNEL_KEY = "ruforge-channel-videos-v1:";
/** Uploads move slowly; a day-old shelf is still right, a fetch per launch is not free. */
const CHANNEL_TTL_MS = 6 * 60 * 60 * 1000;
const HISTORY_KEY = "ruforge-youtube-history-v1";
const HISTORY_TTL_MS = 30 * 60 * 1000;

type Cached = { at: number; items: FeedVideo[] };

function readCache(key: string, ttl: number): FeedVideo[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!Array.isArray(parsed.items) || typeof parsed.at !== "number" || Date.now() - parsed.at > ttl) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(key: string, items: FeedVideo[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), items } satisfies Cached));
  } catch {
    /* A full quota only costs a refetch next time. */
  }
}

const inFlight = new Set<string>();
const settled = new Set<string>();

function setChannel(channelId: string, items: FeedVideo[]): void {
  useChannelVideosStore.setState((s) => ({ byChannel: { ...s.byChannel, [channelId]: items } }));
}

function setStatus(channelId: string, status: ChannelVideosStatus): void {
  useChannelVideosStore.setState((s) => ({ status: { ...s.status, [channelId]: status } }));
}

/** The flat channel tab has no views or dates; the stats pass adds both, which "popular" needs. */
export async function loadChannelVideos(channelId: string, { force = false } = {}): Promise<void> {
  if (inFlight.has(channelId) || (settled.has(channelId) && !force)) return;
  const cached = force ? null : readCache(CHANNEL_KEY + channelId, CHANNEL_TTL_MS);
  if (cached) {
    settled.add(channelId);
    setChannel(channelId, cached);
    setStatus(channelId, "done");
    return;
  }
  inFlight.add(channelId);
  setStatus(channelId, "loading");
  try {
    const items = await invoke<FeedVideo[]>("get_channel_videos", { channelId });
    setChannel(channelId, items);
    setStatus(channelId, "done");
    const stats = await invoke<VideoStats[]>("get_video_stats", { videoIds: items.map((v) => v.videoId) }).catch(
      () => [],
    );
    const merged = applyVideoStats(items, stats);
    setChannel(channelId, merged);
    writeCache(CHANNEL_KEY + channelId, merged);
  } catch (e) {
    console.warn("get_channel_videos failed", e);
    setStatus(channelId, "error");
  } finally {
    inFlight.delete(channelId);
    settled.add(channelId);
  }
}

let historyState: "idle" | "loading" | "done" = "idle";

export async function loadYoutubeHistory(): Promise<void> {
  if (historyState !== "idle") return;
  const cached = readCache(HISTORY_KEY, HISTORY_TTL_MS);
  if (cached) {
    historyState = "done";
    useChannelVideosStore.setState({ history: cached });
    return;
  }
  const s = useRuforgeStore.getState();
  const cookies = feedCookieSource(s.settings, s.youtubeSessionStatus);
  if (!cookies) return;
  historyState = "loading";
  try {
    const history = await invoke<FeedVideo[]>("get_youtube_history", {
      browserCookies: cookies.browserCookies,
      cookieFile: cookies.cookieFile,
    });
    useChannelVideosStore.setState({ history });
    writeCache(HISTORY_KEY, history);
  } catch (e) {
    console.warn("get_youtube_history failed", e);
  } finally {
    historyState = "done";
  }
}

/** Loads uploads for each shelf channel, plus watch history when signed in. */
export function useChannelVideos(channelIds: string[], active: boolean): ChannelVideosState {
  const signedIn = useRuforgeStore((s) => feedCookieSource(s.settings, s.youtubeSessionStatus) !== null);
  const key = channelIds.join(",");
  useEffect(() => {
    if (!active || !key) return;
    for (const id of key.split(",")) void loadChannelVideos(id);
    if (signedIn) void loadYoutubeHistory();
  }, [active, key, signedIn]);
  return useChannelVideosStore();
}

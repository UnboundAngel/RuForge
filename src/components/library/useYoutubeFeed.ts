import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { clearYoutubeProfileCache } from "@/lib/youtubeProfileSession";
import {
  FEED_SIGNED_OUT_ERROR,
  type FeedPage,
  type FeedVideo,
  type VideoStats,
  applyVideoStats,
  feedVideoNeedsStats,
  clearCachedFeed,
  clearFeedBackoff,
  feedBackoffActive,
  feedCookieSource,
  mergeFeedPages,
  readCachedFeed,
  startFeedBackoff,
  writeCachedFeed,
} from "./youtubeFeed";

/** About three rows at the widest grid: enough to fill Show more without a second request. */
export const FEED_PAGE_SIZE = 24;

type FeedState = {
  items: FeedVideo[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  /** Set once anything (cache or network) has answered, so the shelf can tell empty from not yet. */
  loaded: boolean;
};

export const useYoutubeFeedStore = create<FeedState>(() => ({
  items: [],
  hasMore: false,
  loading: false,
  error: null,
  loaded: false,
}));

let inFlight: Promise<void> | null = null;

function currentCookies() {
  const s = useRuforgeStore.getState();
  return feedCookieSource(s.settings, s.youtubeSessionStatus);
}

async function fetchPage(offset: number): Promise<FeedPage> {
  const cookies = currentCookies();
  if (!cookies) throw new Error("signed out");
  return invoke<FeedPage>("get_youtube_feed_page", {
    offset,
    limit: FEED_PAGE_SIZE,
    browserCookies: cookies.browserCookies,
    cookieFile: cookies.cookieFile,
  });
}

const statsRequested = new Set<string>();

/** Fills channel ids and view counts the flat feed leaves out; each video is asked about once. */
async function enrichFeed(): Promise<void> {
  const missing = useYoutubeFeedStore
    .getState()
    .items.filter((v) => feedVideoNeedsStats(v) && !statsRequested.has(v.videoId))
    .map((v) => v.videoId);
  if (missing.length === 0) return;
  for (const id of missing) statsRequested.add(id);
  const stats = await invoke<VideoStats[]>("get_video_stats", { videoIds: missing }).catch(() => []);
  const { items, hasMore } = useYoutubeFeedStore.getState();
  const merged = applyVideoStats(items, stats);
  if (merged === items) return;
  useYoutubeFeedStore.setState({ items: merged });
  writeCachedFeed(merged, hasMore);
}

function run(task: () => Promise<void>): Promise<void> {
  if (inFlight) return inFlight;
  useYoutubeFeedStore.setState({ loading: true, error: null });
  inFlight = task()
    .catch((e: unknown) => {
      const error = String(e);
      if (error.includes(FEED_SIGNED_OUT_ERROR) && currentCookies()?.browserCookies === "ruforge") {
        // The cached avatar keeps the session "signed-in" across launches; live cookies are the truth.
        clearYoutubeProfileCache();
        useRuforgeStore.getState().setYoutubeProfileSession({ status: "signed-out", profile: null });
        clearFeedBackoff();
      } else {
        startFeedBackoff();
      }
      useYoutubeFeedStore.setState({ error, loaded: true });
    })
    .finally(() => {
      inFlight = null;
      useYoutubeFeedStore.setState({ loading: false });
      void enrichFeed();
    });
  return inFlight;
}

/** First page, from cache when fresh. `force` is the Refresh button: new picks, backoff ignored. */
export function loadYoutubeFeed({ force = false } = {}): Promise<void> {
  if (!force) {
    const cached = readCachedFeed();
    if (cached) {
      useYoutubeFeedStore.setState({ items: cached.items, hasMore: cached.hasMore, loaded: true, error: null });
      void enrichFeed();
      return Promise.resolve();
    }
    if (feedBackoffActive()) {
      useYoutubeFeedStore.setState({ loaded: true });
      return Promise.resolve();
    }
  } else {
    clearCachedFeed();
    clearFeedBackoff();
  }
  return run(async () => {
    const page = await fetchPage(0);
    writeCachedFeed(page.items, page.hasMore);
    useYoutubeFeedStore.setState({ items: page.items, hasMore: page.hasMore, loaded: true });
  });
}

export function loadMoreYoutubeFeed(): Promise<void> {
  const { items, hasMore } = useYoutubeFeedStore.getState();
  if (!hasMore || feedBackoffActive()) return Promise.resolve();
  return run(async () => {
    const page = await fetchPage(items.length);
    const merged = mergeFeedPages(useYoutubeFeedStore.getState().items, page.items);
    writeCachedFeed(merged, page.hasMore);
    useYoutubeFeedStore.setState({ items: merged, hasMore: page.hasMore, loaded: true });
  });
}

/** Whether the feed can load at all: the setting is on and there is a signed-in cookie source. */
export function useYoutubeFeedAvailability(): { enabled: boolean; signedIn: boolean; sessionPending: boolean } {
  const enabled = useRuforgeStore((s) => s.settings.showYoutubeFeedInLibrary !== false);
  const signedIn = useRuforgeStore((s) => feedCookieSource(s.settings, s.youtubeSessionStatus) !== null);
  const sessionPending = useRuforgeStore((s) => s.youtubeSessionStatus === "pending");
  return { enabled, signedIn, sessionPending };
}

/** Loads the feed once the shelf is on screen and signed in. */
export function useYoutubeFeed(active: boolean): FeedState {
  const { enabled, signedIn } = useYoutubeFeedAvailability();
  useEffect(() => {
    if (active && enabled && signedIn) void loadYoutubeFeed();
  }, [active, enabled, signedIn]);
  return useYoutubeFeedStore();
}

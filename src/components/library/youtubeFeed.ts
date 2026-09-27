import type { RuforgeSettings, YoutubeSessionStatus } from "@/store/types";

/** One not-yet-downloaded video from the user's YouTube home feed. */
export type FeedVideo = {
  videoId: string;
  title: string;
  url: string;
  channel: string | null;
  thumbnail: string | null;
  duration: number | null;
  viewCount: number | null;
  /** Unix seconds, approximate: parsed from YouTube's "3 days ago". */
  timestamp: number | null;
};

export type FeedPage = { items: FeedVideo[]; hasMore: boolean };

export type FeedCookieSource = { browserCookies: string | null; cookieFile: string | null };

/**
 * The feed is useless signed out, so it needs a cookie source. A signed-in Explorer counts even
 * when the downloader has no cookie source picked, since both share the Internal profile.
 */
export function feedCookieSource(
  settings: Pick<RuforgeSettings, "browserContext" | "cookieFile">,
  session: YoutubeSessionStatus,
): FeedCookieSource | null {
  const cookieFile = settings.cookieFile?.trim();
  if (cookieFile) return { browserCookies: null, cookieFile };
  const browser = settings.browserContext?.trim();
  if (browser && browser !== "chrome") return { browserCookies: browser, cookieFile: null };
  if (session === "signed-in") return { browserCookies: "ruforge", cookieFile: null };
  return null;
}

/** Drops what the library already has, so a finished download leaves the feed for the grid. */
export function feedWithoutLibrary(items: FeedVideo[], libraryIds: ReadonlySet<string>): FeedVideo[] {
  return items.filter((item) => !libraryIds.has(item.videoId));
}

/** Appends a later page, skipping repeats: YouTube reshuffles between continuation requests. */
export function mergeFeedPages(current: FeedVideo[], next: FeedVideo[]): FeedVideo[] {
  const seen = new Set(current.map((v) => v.videoId));
  return [...current, ...next.filter((v) => !seen.has(v.videoId) && seen.add(v.videoId))];
}

export function formatViewCount(n: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  if (n < 1000) return `${n} ${n === 1 ? "view" : "views"}`;
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const value = n / size;
      const text = value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.floor(value).toString();
      return `${text}${suffix} views`;
    }
  }
  return null;
}

/** YouTube's wording: whole units, rounded down, largest first. */
export function formatAge(unixSec: number, nowMs = Date.now()): string {
  const secs = Math.max(0, Math.floor(nowMs / 1000 - unixSec));
  const steps: [number, string][] = [
    [365 * 86400, "year"],
    [30 * 86400, "month"],
    [7 * 86400, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, unit] of steps) {
    const n = Math.floor(secs / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

/** Long enough to judge a video, short enough that it stays a taste and not a free watch. */
export const VIDEO_PREVIEW_SEC = 30;
const SHORT_VIDEO_SEC = 60;
/** Past the intro and sponsor read in most videos, before the payoff. */
const GUESS_FRACTION = 0.2;
const GUESS_MIN_SEC = 15;
const GUESS_MAX_SEC = 120;

/** Where a preview starts: the most replayed moment when known, else a guess, always leaving a full window. */
export function videoPreviewStartSec(duration: number | null, hookStart: number | null): number {
  if (duration == null || !Number.isFinite(duration) || duration <= SHORT_VIDEO_SEC) return 0;
  const start = hookStart ?? Math.min(GUESS_MAX_SEC, Math.max(GUESS_MIN_SEC, duration * GUESS_FRACTION));
  return Math.max(0, Math.min(duration - VIDEO_PREVIEW_SEC, start));
}

const CACHE_KEY = "ruforge-youtube-feed-cache";
/** Long enough that tab switches and restarts reuse it, short enough that the feed feels alive. */
export const FEED_CACHE_TTL_MS = 30 * 60 * 1000;
const BACKOFF_KEY = "ruforge-youtube-feed-backoff";
const BACKOFF_MS = 10 * 60 * 1000;

type CachedFeed = { at: number; items: FeedVideo[]; hasMore: boolean };

export function readCachedFeed(nowMs = Date.now()): CachedFeed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFeed;
    if (!Array.isArray(parsed.items) || typeof parsed.at !== "number") return null;
    if (nowMs - parsed.at > FEED_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedFeed(items: FeedVideo[], hasMore: boolean, nowMs = Date.now()): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: nowMs, items, hasMore } satisfies CachedFeed));
  } catch {
    /* A full quota only costs a refetch next time. */
  }
}

export function clearCachedFeed(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** After a failure, stop asking YouTube for a while instead of hammering it on every visit. */
export function feedBackoffActive(nowMs = Date.now()): boolean {
  try {
    const until = Number(localStorage.getItem(BACKOFF_KEY) ?? 0);
    return nowMs < until;
  } catch {
    return false;
  }
}

export function startFeedBackoff(nowMs = Date.now()): void {
  try {
    localStorage.setItem(BACKOFF_KEY, String(nowMs + BACKOFF_MS));
  } catch {
    /* ignore */
  }
}

export function clearFeedBackoff(): void {
  try {
    localStorage.removeItem(BACKOFF_KEY);
  } catch {
    /* ignore */
  }
}

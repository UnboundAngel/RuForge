import type { FeedVideo } from "@/components/library/youtubeFeed";
import type { WatchlistSnapshot, WatchlistUpload } from "./types";

export function unseenUploads(s: WatchlistSnapshot | null): WatchlistUpload[] {
  return s ? s.uploads.filter((u) => !u.seen) : [];
}

/** Reading the notification only clears the bell; the upload stays on the shelf this long after it went up. */
export const SHELF_SEEN_WINDOW_SEC = 7 * 86_400;

/** Premieres and live streams stay off the shelf: there is nothing to download yet. */
export function shelfUploads(
  s: WatchlistSnapshot | null,
  libraryIds: ReadonlySet<string>,
  limit: number,
  nowSec = Math.floor(Date.now() / 1000),
): WatchlistUpload[] {
  if (!s || limit <= 0) return [];
  return s.uploads
    .filter(
      (u) =>
        u.liveStatus === "none" &&
        !libraryIds.has(u.videoId) &&
        (!u.seen || nowSec - u.publishedAt <= SHELF_SEEN_WINDOW_SEC),
    )
    .slice(0, limit);
}

export function toFeedVideo(u: WatchlistUpload): FeedVideo {
  return {
    videoId: u.videoId,
    title: u.title,
    url: u.url,
    channel: u.channelTitle,
    channelId: u.channelId,
    channelVerified: false,
    thumbnail: u.thumbnail,
    duration: u.durationSec,
    viewCount: null,
    timestamp: u.publishedAt,
  };
}

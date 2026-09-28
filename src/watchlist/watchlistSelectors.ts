import type { FeedVideo } from "@/components/library/youtubeFeed";
import type { WatchlistSnapshot, WatchlistUpload } from "./types";

export function unseenUploads(s: WatchlistSnapshot | null): WatchlistUpload[] {
  return s ? s.uploads.filter((u) => !u.seen) : [];
}

/** Premieres and live streams stay off the shelf: there is nothing to download yet. */
export function shelfUploads(
  s: WatchlistSnapshot | null,
  libraryIds: ReadonlySet<string>,
  limit: number,
): WatchlistUpload[] {
  if (limit <= 0) return [];
  return unseenUploads(s)
    .filter((u) => u.liveStatus === "none" && !libraryIds.has(u.videoId))
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
    short: false,
  };
}

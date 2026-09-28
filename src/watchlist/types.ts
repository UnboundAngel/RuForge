export type LiveStatus = "none" | "upcoming" | "live";

export type WatchedChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  followedAt: number;
  autoDownload: boolean;
  lastCheckedAt: number | null;
  lastError: string | null;
};

export type WatchlistUpload = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: number;
  discoveredAt: number;
  durationSec: number | null;
  liveStatus: LiveStatus;
  scheduledAt: number | null;
  seen: boolean;
  autoQueued: boolean;
};

export type WatchlistSnapshot = {
  channels: WatchedChannel[];
  uploads: WatchlistUpload[];
  unseenCount: number;
  checkIntervalMin: number;
};

export type ResolvedChannel = { channelId: string; title: string; handle: string | null };

export type UploadsPayload = { uploads: WatchlistUpload[] };

export const WATCHLIST_UPDATED_EVENT = "watchlist-updated";
export const WATCHLIST_NEW_UPLOADS_EVENT = "watchlist-new-uploads";
export const WATCHLIST_AUTO_READY_EVENT = "watchlist-auto-ready";

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

/** Drained from Rust with `take_watchlist_events`; the events themselves carry no payload. */
export type WatchlistEvents = { newUploads: WatchlistUpload[]; autoReady: WatchlistUpload[] };

export type ChannelFollowMessage = { tone: "error" | "info"; text: string };

/** Channels tab state owned by main and handed to both popover hosts as props. */
export type ChannelsUiState = {
  followPending: boolean;
  followMessage: ChannelFollowMessage | null;
  /** Bumps on every successful follow so the field knows to clear its text. */
  followSeq: number;
  /** Wall clock ms; main and the overlay webview share the clock. */
  checkNowUntil: number;
};

export const WATCHLIST_UPDATED_EVENT = "watchlist-updated";
export const WATCHLIST_EVENTS_EVENT = "watchlist-events";

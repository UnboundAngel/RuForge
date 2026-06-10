export type ListenEndReason =
  | "completed"
  | "skipped"
  | "wall_endless_pick"
  | "manual_switch"
  | "abandoned_paused";

export type ListenSurface = "main" | "music_mini";

export type PlaySource =
  | "folder"
  | "library"
  | "album"
  | "liked"
  | "explore"
  | "unknown";

export type ListenTrackMeta = {
  identityKey: string;
  path?: string;
  title?: string;
  artist?: string;
};

export type ListenStatRow = {
  identityKey: string;
  path: string;
  title: string;
  artist: string;
  playCount: number;
  listenTimeSec: number;
  lastPlayed: number;
};

export type PlayHistoryRow = {
  path: string;
  identityKey: string;
  title: string;
  artist: string;
  playedAt: number;
  playCount: number;
};

export type ListenSnapshot = {
  v: number;
  stats: ListenStatRow[];
  history: PlayHistoryRow[];
};

export const EMPTY_LISTEN_SNAPSHOT: ListenSnapshot = { v: 1, stats: [], history: [] };

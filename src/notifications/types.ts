export type NotificationSourceId = "watchlist" | "download";

export type NotificationKind =
  | "upload"
  | "premiere"
  | "live"
  | "download-finished"
  | "download-failed"
  | "download-timed-out"
  /** Storage cap or disk space: a queue hold or a refused add. */
  | "download-blocked";

export type NotificationActionId =
  | "queue"
  | "open-explorer"
  | "play"
  | "show-in-folder"
  | "retry"
  | "open-storage-settings";

export type NotificationItem = {
  /** Stable `${source}:${key}` so re-recording updates in place. */
  id: string;
  source: NotificationSourceId;
  kind: NotificationKind;
  title: string;
  /** Secondary line: channel name, error text, file name. */
  subtitle: string | null;
  thumbnail: string | null;
  /** For a channel avatar badge on the thumbnail. */
  channelId: string | null;
  /** Milliseconds. */
  createdAt: number;
  read: boolean;
  actions: NotificationActionId[];
  /** Source-specific references the source's action runner needs. */
  ref: {
    videoId?: string;
    url?: string;
    jobId?: string;
    outputPath?: string;
    scheduledAt?: number | null;
    /** Earlier failed tries of this video, folded into its newest row. */
    failedAttempts?: number;
    /** Full failure text for Copy error: the row's own, or the newest folded failed try's. */
    error?: string;
  };
};

export type NotificationSource = {
  id: NotificationSourceId;
  /** Pure projection from store state into items. */
  items: () => NotificationItem[];
  markRead: (ids: string[]) => void | Promise<void>;
  markAllRead: () => void | Promise<void>;
  /** Resolve `false` when the action was refused (storage full, gone) so the row stays unread. */
  runAction: (item: NotificationItem, action: NotificationActionId) => boolean | void | Promise<boolean | void>;
  subscribe: (onChange: () => void) => () => void;
};

/** `settings` is the gear view, not a tab strip entry. */
export type NotificationCenterTab = "feed" | "channels" | "history" | "settings";

/** Notification settings the panel shows; alerts live in app settings, the interval in Rust's watchlist. */
export type NotificationPrefs = { alerts: boolean; checkIntervalMin: number };

export type NotificationCenterFilter = "all" | NotificationSourceId;

/** `history` is reserved for the Download history log, which flips `enabled` when it lands. */
export const NOTIFICATION_CENTER_TABS = [
  { id: "feed", label: "Notifications", enabled: true },
  { id: "channels", label: "Channels", enabled: true },
  { id: "history", label: "History", enabled: false },
] as const satisfies readonly { id: NotificationCenterTab; label: string; enabled: boolean }[];

export const NOTIFICATION_CENTER_RECORD_EVENT = "notification-center-record";

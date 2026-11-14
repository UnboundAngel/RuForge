export type NotificationSourceId = "watchlist" | "download" | "security" | "stats" | "playlist" | "dev";

export type NotificationKind =
  | "upload"
  | "premiere"
  | "live"
  | "download-finished"
  | "download-failed"
  | "download-timed-out"
  /** Storage cap or disk space: a queue hold or a refused add. */
  | "download-blocked"
  /** The last session ended with unfinished downloads; the row offers Resume. */
  | "download-paused"
  /** A YouTube page tried to leave YouTube or poked a decoy (`src/lib/securityTripwires.ts`). */
  | "security-blocked"
  /** Quiet milestone from the activity stats engine. */
  | "stats-milestone"
  /** A downloaded playlist gained videos (`src/playlistWatch/`). */
  | "playlist-new"
  /** Signed "From the dev" announcements (`src/lib/devAnnouncementsHost.ts`). */
  | "dev-notice"
  | "dev-poll";

/** One per poll option (ids a to f). They live in `actions` because the overlay host only runs listed actions; a voted or closed poll lists none. */
export const POLL_PICK_ACTIONS = [
  "poll-pick-a",
  "poll-pick-b",
  "poll-pick-c",
  "poll-pick-d",
  "poll-pick-e",
  "poll-pick-f",
] as const;
export type PollPickAction = (typeof POLL_PICK_ACTIONS)[number];

export function isPollPick(action: NotificationActionId): action is PollPickAction {
  return (POLL_PICK_ACTIONS as readonly string[]).includes(action);
}

export type NotificationActionId =
  | PollPickAction
  | "queue"
  | "open-explorer"
  | "play"
  | "show-in-folder"
  | "retry"
  | "open-storage-settings"
  | "resume-queue"
  | "open-link";

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
  /** Personal-best stats rows: the record (bytes/s or seconds) and the one it beat. */
  record?: { value: number; previous?: number; titles?: string[] };
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
    /** A download of this video was refused for storage and storage is still full. */
    storageHeld?: boolean;
    /** Videos a downloaded playlist gained, and the folder they belong in. */
    /** Announcement link (notice), and when a poll closes. */
    devUrl?: string;
    devOptions?: { id: string; label: string }[];
    endsAt?: number | null;
    /** Derived in `devSource`, never persisted. `counts` is only set once the user may see results. */
    devVote?: { pick: string | null; counts: Record<string, number> | null; error: string | null; busy: boolean };
    playlist?: { listId: string; outputDir: string; folderName: string; videos: { id: string; title: string }[] };
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

/** What the user can silence: hidden from the feed and badge, and no toast or island notice. */
export type NotificationMuteKey = "uploads" | "downloads" | "problems" | "milestones" | "security" | "dev";

/** Notification settings the panel shows; alerts and mutes live in app settings, the interval in Rust's watchlist. */
export type NotificationPrefs = { alerts: boolean; checkIntervalMin: number; muted: NotificationMuteKey[] };

export type NotificationCenterFilter = "all" | NotificationSourceId;

/** `history` is reserved for the Download history log, which flips `enabled` when it lands. */
export const NOTIFICATION_CENTER_TABS = [
  { id: "feed", label: "Notifications", enabled: true },
  { id: "channels", label: "Channels", enabled: true },
  { id: "history", label: "History", enabled: false },
] as const satisfies readonly { id: NotificationCenterTab; label: string; enabled: boolean }[];

export const NOTIFICATION_CENTER_RECORD_EVENT = "notification-center-record";

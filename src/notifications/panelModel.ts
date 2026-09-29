import type { NotificationActionId, NotificationCenterFilter, NotificationItem, NotificationKind } from "./types";

export const NOTIFICATION_FILTERS: readonly { id: NotificationCenterFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "watchlist", label: "Uploads" },
  { id: "download", label: "Downloads" },
];

export function filterNotificationItems(
  items: NotificationItem[],
  filter: NotificationCenterFilter,
): NotificationItem[] {
  return filter === "all" ? items : items.filter((i) => i.source === filter);
}

/** These move the user to another surface, so the popover would only sit on top of it. */
const CLOSING_ACTIONS: ReadonlySet<NotificationActionId> = new Set([
  "open-explorer",
  "play",
  "open-storage-settings",
]);

export function actionClosesPopover(action: NotificationActionId): boolean {
  return CLOSING_ACTIONS.has(action);
}

export function unreadBadgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function splitByRead(items: NotificationItem[]): { fresh: NotificationItem[]; earlier: NotificationItem[] } {
  const fresh: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];
  for (const item of items) (item.read ? earlier : fresh).push(item);
  return { fresh, earlier };
}

const WATCHLIST_VERB: Partial<Record<NotificationKind, string>> = {
  upload: "uploaded",
  premiere: "scheduled a premiere",
  live: "is live",
};

export type NotificationHeadline = { channel: string | null; verb: string | null; title: string };

/** Premiere and live rows keep their status in `subtitle`, so their channel name comes from the followed list. */
export function notificationHeadline(item: NotificationItem, channelName: string | null): NotificationHeadline {
  const verb = WATCHLIST_VERB[item.kind] ?? null;
  const channel = item.source === "watchlist" ? channelName || (item.kind === "upload" ? item.subtitle : null) : null;
  if (!verb || !channel) return { channel: null, verb: null, title: item.title };
  return { channel, verb, title: item.title };
}

export type NotificationKicker = { text: string; tone: "accent" | "danger" | "warn" | "muted" };

const DOWNLOAD_KICKER: Partial<Record<NotificationKind, NotificationKicker>> = {
  "download-finished": { text: "Downloaded", tone: "accent" },
  "download-failed": { text: "Download failed", tone: "danger" },
  "download-timed-out": { text: "Timed out", tone: "danger" },
  "download-blocked": { text: "Held", tone: "warn" },
};

/** The short line above the title: what happened and who did it, so the title only names the video. */
export function notificationKicker(item: NotificationItem, channelName: string | null): NotificationKicker {
  const download = DOWNLOAD_KICKER[item.kind];
  if (download) return download;
  const { channel, verb } = notificationHeadline(item, channelName);
  if (channel && verb) return { text: `${channel} ${verb}`, tone: item.kind === "upload" ? "muted" : "accent" };
  if (item.kind === "live") return { text: "Live now", tone: "accent" };
  if (item.kind === "premiere") return { text: "Premiere", tone: "accent" };
  return { text: "New upload", tone: "muted" };
}

/** Subtitle under the title, unless it only repeats the title, the channel, or the kicker. */
export function notificationDetail(item: NotificationItem): string | null {
  const detail = item.subtitle?.trim();
  if (!detail || detail === item.title.trim()) return null;
  if (item.kind === "upload" || item.kind === "live") return null;
  return detail;
}

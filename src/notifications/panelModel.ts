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

export function notificationMeta(item: NotificationItem, age: string, headlineHasChannel: boolean): string {
  const redundant = item.kind === "live" || (item.kind === "upload" && headlineHasChannel);
  return item.subtitle && !redundant ? `${item.subtitle} · ${age}` : age;
}

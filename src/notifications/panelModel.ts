import type { NotificationActionId, NotificationCenterFilter, NotificationItem } from "./types";

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

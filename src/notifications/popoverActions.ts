import { setNotificationPopoverOpen } from "./notificationCenterStore";
import { actionClosesPopover } from "./panelModel";
import { markAllNotificationsRead, markNotificationsRead, notificationSource } from "./registry";
import type { NotificationActionId, NotificationItem } from "./types";

/** Shared by the in-page popover and the overlay webview bridge so both hosts behave the same. */
export async function runNotificationAction(item: NotificationItem, action: NotificationActionId): Promise<void> {
  const source = notificationSource(item.source);
  if (!source) return;
  if (actionClosesPopover(action)) setNotificationPopoverOpen(false);
  try {
    if ((await source.runAction(item, action)) === false) return;
    await markNotificationsRead([item]);
  } catch (e) {
    console.error(e);
  }
}

export function markOneNotificationRead(item: NotificationItem): void {
  void markNotificationsRead([item]).catch(console.error);
}

export function markEveryNotificationRead(): void {
  void markAllNotificationsRead().catch(console.error);
}

export function closeNotificationPopover(): void {
  setNotificationPopoverOpen(false);
}

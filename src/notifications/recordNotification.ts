import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isNotifyOverlayDocument } from "@/lib/notifyOverlayEvents";
import { loadLocal, pruneLocal, startLocalPersistence, upsertLocal } from "./notificationCenterStore";
import { NOTIFICATION_CENTER_RECORD_EVENT, type NotificationItem } from "./types";

function isMainWindow(): boolean {
  if (isNotifyOverlayDocument()) return false;
  try {
    return getCurrentWindow().label === "main";
  } catch {
    return false;
  }
}

/** Main owns the center; other windows hand their records over instead of writing a second copy. */
export function recordNotification(item: NotificationItem): void {
  if (isMainWindow()) {
    upsertLocal(item);
    return;
  }
  void emitTo("main", NOTIFICATION_CENTER_RECORD_EVENT, item).catch(() => {});
}

/** Main window only. */
export async function startNotificationCenter(): Promise<() => void> {
  loadLocal();
  pruneLocal(Date.now());
  const stopPersistence = startLocalPersistence();
  let unlisten: (() => void) | null = null;
  try {
    unlisten = await listen<NotificationItem>(NOTIFICATION_CENTER_RECORD_EVENT, (e) => upsertLocal(e.payload));
  } catch (e) {
    console.error("notification center listen failed", e);
  }
  return () => {
    unlisten?.();
    stopPersistence();
  };
}

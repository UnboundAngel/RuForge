import { getCurrentWindow } from "@tauri-apps/api/window";
import { isNotifyOverlayDocument } from "@/lib/notifyOverlayEvents";
import { listenPrivateQueue, pushPrivateRecord } from "@/lib/privateMailbox";
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

/**
 * Main owns the center; other windows hand their records over instead of writing a second copy.
 * The handoff goes through Rust so the Explorer page can neither read records nor forge one with a file path.
 */
export function recordNotification(item: NotificationItem): void {
  if (isMainWindow()) {
    upsertLocal(item);
    return;
  }
  void pushPrivateRecord("notification-center-record", "main", NOTIFICATION_CENTER_RECORD_EVENT, item).catch(
    () => {},
  );
}

function isRecord(value: unknown): value is NotificationItem {
  const v = value as NotificationItem | null;
  return !!v && typeof v === "object" && typeof v.id === "string" && Array.isArray(v.actions);
}

/** Main window only. */
export async function startNotificationCenter(): Promise<() => void> {
  loadLocal();
  pruneLocal(Date.now());
  const stopPersistence = startLocalPersistence();
  let unlisten: (() => void) | null = null;
  try {
    unlisten = await listenPrivateQueue<unknown>(
      "notification-center-record",
      NOTIFICATION_CENTER_RECORD_EVENT,
      (record) => {
        if (isRecord(record)) upsertLocal(record);
      },
    );
  } catch (e) {
    console.error("notification center listen failed", e);
  }
  return () => {
    unlisten?.();
    stopPersistence();
  };
}

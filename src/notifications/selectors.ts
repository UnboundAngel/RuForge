import { useMemo, useSyncExternalStore } from "react";
import { NOTIFICATION_SOURCES } from "./registry";
import type { NotificationItem } from "./types";

export function allItems(): NotificationItem[] {
  return NOTIFICATION_SOURCES.flatMap((s) => s.items()).sort((a, b) => b.createdAt - a.createdAt);
}

export function unreadCount(): number {
  let n = 0;
  for (const source of NOTIFICATION_SOURCES) {
    for (const item of source.items()) if (!item.read) n++;
  }
  return n;
}

let version = 0;

function subscribeAll(onChange: () => void): () => void {
  const offs = NOTIFICATION_SOURCES.map((s) =>
    s.subscribe(() => {
      version++;
      onChange();
    }),
  );
  return () => {
    for (const off of offs) off();
  };
}

function getVersion(): number {
  return version;
}

export function useNotificationItems(): NotificationItem[] {
  const v = useSyncExternalStore(subscribeAll, getVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => allItems(), [v]);
}

export function useUnreadCount(): number {
  return useSyncExternalStore(subscribeAll, unreadCount);
}

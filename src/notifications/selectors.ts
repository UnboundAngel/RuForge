import { useMemo, useSyncExternalStore } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { currentMuted } from "./mute";
import { filterMuted } from "./muteModel";
import { NOTIFICATION_SOURCES } from "./registry";
import type { NotificationItem } from "./types";

/** Muted groups are hidden here, so the feed and the badge agree; the records stay and return on unmute. */
export function allItems(): NotificationItem[] {
  const muted = currentMuted();
  return NOTIFICATION_SOURCES.flatMap((s) => filterMuted(s.items(), muted)).sort((a, b) => b.createdAt - a.createdAt);
}

export function unreadCount(): number {
  const muted = currentMuted();
  let n = 0;
  for (const source of NOTIFICATION_SOURCES) {
    for (const item of filterMuted(source.items(), muted)) if (!item.read) n++;
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
  const offMuted = useRuforgeStore.subscribe((st, prev) => {
    if (st.settings.notificationMuted !== prev.settings.notificationMuted) {
      version++;
      onChange();
    }
  });
  return () => {
    offMuted();
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

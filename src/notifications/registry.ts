import { downloadSource } from "./sources/downloadSource";
import { playlistSource } from "./sources/playlistSource";
import { securitySource } from "./sources/securitySource";
import { statsSource } from "./sources/statsSource";
import { watchlistSource } from "./sources/watchlistSource";
import type { NotificationItem, NotificationSource } from "./types";

/** Feed order on ties. A new producer is one source file plus one line here. */
export const NOTIFICATION_SOURCES: readonly NotificationSource[] = [
  watchlistSource,
  downloadSource,
  playlistSource,
  securitySource,
  statsSource,
];

export function notificationSource(id: NotificationItem["source"]): NotificationSource | undefined {
  return NOTIFICATION_SOURCES.find((s) => s.id === id);
}

export async function markNotificationsRead(items: NotificationItem[]): Promise<void> {
  await Promise.all(
    NOTIFICATION_SOURCES.map((source) => {
      const ids = items.filter((i) => i.source === source.id && !i.read).map((i) => i.id);
      return ids.length > 0 ? source.markRead(ids) : undefined;
    }),
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  await Promise.all(NOTIFICATION_SOURCES.map((s) => s.markAllRead()));
}

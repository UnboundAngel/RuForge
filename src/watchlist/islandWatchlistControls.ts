import {
  setNotificationFilter,
  setNotificationPopoverOpen,
  setNotificationTab,
} from "@/notifications/notificationCenterStore";
import type { WatchlistUpload } from "./types";
import { markAllSeen, openUploadInExplorer, queueUpload } from "./watchlistActions";
import { clearIslandBatch, useWatchlistStore } from "./watchlistStore";

/** The island only sends ids; main trusts nothing it cannot find in its own snapshot. */
function findUpload(videoId: unknown): WatchlistUpload | null {
  if (typeof videoId !== "string" || videoId.length === 0) return null;
  return useWatchlistStore.getState().snapshot?.uploads.find((u) => u.videoId === videoId) ?? null;
}

// Two quick clicks both land before mark_watchlist_seen comes back; without this both enqueue.
const queueing = new Set<string>();

export function queueFromIsland(videoId: unknown): void {
  const upload = findUpload(videoId);
  if (!upload || upload.seen || upload.liveStatus !== "none" || queueing.has(upload.videoId)) return;
  queueing.add(upload.videoId);
  void queueUpload(upload)
    .catch((e) => console.error("island watchlist queue failed", e))
    .finally(() => queueing.delete(upload.videoId));
}

export function openFromIsland(videoId: unknown): void {
  const upload = findUpload(videoId);
  if (!upload) return;
  void openUploadInExplorer(upload).catch((e) => console.error("island watchlist open failed", e));
}

export function markAllSeenFromIsland(): void {
  void markAllSeen()
    .then(() => clearIslandBatch())
    .catch((e) => console.error("mark_all_watchlist_seen failed", e));
}

export function showAllFromIsland(): void {
  setNotificationTab("feed");
  setNotificationFilter("watchlist");
  setNotificationPopoverOpen(true);
}

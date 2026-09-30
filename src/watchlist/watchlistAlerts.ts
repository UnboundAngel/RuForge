import { invoke } from "@tauri-apps/api/core";
import { recordDownloadNotification } from "@/notifications/sources/downloadItems";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { claimUserNotification, deliverUserNotification, isAnyRuforgeWindowFocused } from "@/systemNotify";
import type { WatchlistSnapshot, WatchlistUpload } from "./types";
import { enqueueWatchlistUploads } from "./watchlistActions";
import { pickAutoDownloads, watchlistAlertCopy, watchlistStorageBlockedCopy } from "./watchlistAlertRules";
import { setWatchlistSnapshot, useWatchlistStore } from "./watchlistStore";

const handledAutoIds = new Set<string>();

/** Returns how many uploads were queued. Storage refusal queues nothing and warns once for the batch. */
async function runAutoDownloads(uploads: WatchlistUpload[]): Promise<number> {
  const s = useRuforgeStore.getState();
  const picks = pickAutoDownloads(
    uploads,
    useWatchlistStore.getState().snapshot,
    s.entries,
    s.downloadJobs,
    handledAutoIds,
  );
  if (picks.length === 0) return 0;
  for (const u of picks) handledAutoIds.add(u.videoId);
  const { queued, blocked } = enqueueWatchlistUploads(picks, "watchlistAuto");
  if (blocked) {
    const body = watchlistStorageBlockedCopy(picks.length);
    await deliverUserNotification({ dedupeKey: "watchlist-storage-full", kind: "warning", body }, s.notify);
    recordDownloadNotification("download-blocked", { error: body });
    return 0;
  }
  try {
    setWatchlistSnapshot(await invoke<WatchlistSnapshot>("mark_watchlist_auto_queued", { videoIds: queued }));
  } catch (e) {
    console.error("mark_watchlist_auto_queued failed", e);
  }
  return queued.length;
}

function addToIslandBatch(ids: string[]): void {
  useWatchlistStore.setState((st) => ({
    islandBatchIds: [...st.islandBatchIds, ...ids.filter((id) => !st.islandBatchIds.includes(id))],
    islandBatchAt: Date.now(),
  }));
}

export async function handleNewUploads(uploads: WatchlistUpload[]): Promise<void> {
  if (uploads.length === 0) return;
  if (!claimUserNotification(`watchlist:${uploads.map((u) => u.videoId).join(",")}`)) return;
  const autoQueued = await runAutoDownloads(uploads);
  const s = useRuforgeStore.getState();
  if (!s.settings.watchlistAlerts) return;
  // The island watchlist variant renders this batch; a plain island notice would duplicate it.
  if (await isAnyRuforgeWindowFocused()) s.notify(watchlistAlertCopy(uploads, autoQueued), "info");
  else addToIslandBatch(uploads.map((u) => u.videoId));
}

/** Premieres were already announced when first seen, so this only queues. */
export async function handleAutoReady(uploads: WatchlistUpload[]): Promise<void> {
  if (uploads.length === 0) return;
  await runAutoDownloads(uploads);
}

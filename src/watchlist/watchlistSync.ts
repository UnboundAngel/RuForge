import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  WATCHLIST_EVENTS_EVENT,
  WATCHLIST_UPDATED_EVENT,
  type WatchlistEvents,
  type WatchlistSnapshot,
  type WatchlistUpload,
} from "./types";
import { setWatchlistSnapshot } from "./watchlistStore";

export type WatchlistSyncHandlers = {
  onNewUploads: (uploads: WatchlistUpload[]) => void;
  onAutoReady: (uploads: WatchlistUpload[]) => void;
};

/**
 * Main window only. Rust events are payload-free pings (the Explorer webview can hear events), so the
 * snapshot and upload batches are pulled by command. Listeners go up before the first pull so nothing
 * landing in between is lost.
 */
export async function startWatchlistSync(handlers: WatchlistSyncHandlers): Promise<() => void> {
  let requestSeq = 0;
  const refresh = async () => {
    const seq = ++requestSeq;
    try {
      const snapshot = await invoke<WatchlistSnapshot>("get_watchlist");
      // A newer request may already have answered; never step back to an older snapshot.
      if (seq === requestSeq) setWatchlistSnapshot(snapshot);
    } catch (e) {
      console.error("get_watchlist failed", e);
    }
  };
  // Alert and auto-download rules read channel settings from the snapshot, so refresh it first.
  const drain = async () => {
    await refresh();
    try {
      const events = await invoke<WatchlistEvents>("take_watchlist_events");
      if (events.newUploads.length > 0) handlers.onNewUploads(events.newUploads);
      if (events.autoReady.length > 0) handlers.onAutoReady(events.autoReady);
    } catch (e) {
      console.error("take_watchlist_events failed", e);
    }
  };
  const unlisteners: UnlistenFn[] = await Promise.all([
    listen(WATCHLIST_UPDATED_EVENT, () => void refresh()),
    listen(WATCHLIST_EVENTS_EVENT, () => void drain()),
  ]);
  await drain();
  return () => {
    for (const un of unlisteners) un();
  };
}

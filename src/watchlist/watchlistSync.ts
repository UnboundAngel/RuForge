import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  WATCHLIST_AUTO_READY_EVENT,
  WATCHLIST_NEW_UPLOADS_EVENT,
  WATCHLIST_UPDATED_EVENT,
  type UploadsPayload,
  type WatchlistSnapshot,
  type WatchlistUpload,
} from "./types";
import { setWatchlistSnapshot } from "./watchlistStore";

export type WatchlistSyncHandlers = {
  onNewUploads: (uploads: WatchlistUpload[]) => void;
  onAutoReady: (uploads: WatchlistUpload[]) => void;
};

/** Main window only. Listeners go up before the first fetch so a poll landing in between is not lost. */
export async function startWatchlistSync(handlers: WatchlistSyncHandlers): Promise<() => void> {
  let updatedByEvent = false;
  const unlisteners: UnlistenFn[] = await Promise.all([
    listen<WatchlistSnapshot>(WATCHLIST_UPDATED_EVENT, (e) => {
      updatedByEvent = true;
      setWatchlistSnapshot(e.payload);
    }),
    listen<UploadsPayload>(WATCHLIST_NEW_UPLOADS_EVENT, (e) => handlers.onNewUploads(e.payload.uploads)),
    listen<UploadsPayload>(WATCHLIST_AUTO_READY_EVENT, (e) => handlers.onAutoReady(e.payload.uploads)),
  ]);
  try {
    const initial = await invoke<WatchlistSnapshot>("get_watchlist");
    // An update event that beat this reply is at least as fresh.
    if (!updatedByEvent) setWatchlistSnapshot(initial);
  } catch (e) {
    console.error("get_watchlist failed", e);
  }
  return () => {
    for (const un of unlisteners) un();
  };
}

import { invoke } from "@tauri-apps/api/core";
import { galleryScanRootsFromStore } from "@/lib/libraryConfig";
import { listenPrivateQueue } from "@/lib/privateMailbox";
import { isMuted } from "@/notifications/mute";
import { useNotificationCenterStore, upsertLocal } from "@/notifications/notificationCenterStore";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { claimUserNotification, isAnyRuforgeWindowFocused } from "@/systemNotify";
import { isPlaylistRecord, playlistToastCopy, recordToItem } from "./recordToItem";
import { PLAYLIST_WATCH_EVENT } from "./types";

function inputs() {
  const s = useRuforgeStore.getState();
  return { roots: galleryScanRootsFromStore(s), enabled: s.settings.playlistWatchEnabled !== false };
}

export function syncPlaylistWatch(): Promise<void> {
  const { roots, enabled } = inputs();
  return invoke<void>("playlist_watch_sync", { scanRoots: roots, enabled }).catch((e) =>
    console.error("playlist_watch_sync failed", e),
  );
}

async function onRecord(payload: unknown): Promise<void> {
  if (!isPlaylistRecord(payload)) return;
  const id = `playlist:${payload.listId}`;
  const previous = useNotificationCenterStore.getState().local.find((i) => i.id === id);
  upsertLocal(recordToItem(payload, previous));
  if (isMuted("uploads")) return;
  if (!claimUserNotification(`${id}:${payload.at}`)) return;
  if (await isAnyRuforgeWindowFocused()) useRuforgeStore.getState().notify(playlistToastCopy(payload), "info");
}

/** Main window only. Rust only polls once this has reported the setting and the library roots. */
export async function startPlaylistWatchSync(): Promise<() => void> {
  const unlisten = await listenPrivateQueue<unknown>("playlist-watch-new", PLAYLIST_WATCH_EVENT, (p) => {
    void onRecord(p).catch((e) => console.error("playlist watch alert failed", e));
  });
  let last = "";
  const resync = () => {
    const { roots, enabled } = inputs();
    const key = `${enabled}|${roots.join("\n")}`;
    if (key === last) return;
    last = key;
    void syncPlaylistWatch();
  };
  resync();
  const unsub = useRuforgeStore.subscribe(resync);
  return () => {
    unsub();
    unlisten();
  };
}

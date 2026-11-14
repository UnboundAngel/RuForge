import { useRuforgeStore } from "@/store/ruforgeStore";
import { getVirtualRecord } from "@/virtualPlaylists";

// Set by New on the Playlists page and read once by the detail screen, so only a playlist the
// user just made opens with its name selected and the add-videos guide.
let freshPath: string | null = null;

export function markFreshPlaylist(path: string): void {
  freshPath = path;
}

export function consumeFreshPlaylist(path: string): boolean {
  if (freshPath !== path) return false;
  freshPath = null;
  return true;
}

let cleanupTimer = 0;

/**
 * A playlist made with New and left without videos is dropped when its screen closes. Deferred
 * so StrictMode's dev remount can cancel it.
 */
export function dropFreshPlaylistIfEmpty(id: string): void {
  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(() => {
    const { virtualPlaylistRecords, deleteVirtualPlaylist } = useRuforgeStore.getState();
    const record = getVirtualRecord(id, virtualPlaylistRecords);
    if (record && record.items.length === 0) deleteVirtualPlaylist(id);
  }, 0);
}

export function keepFreshPlaylist(): void {
  window.clearTimeout(cleanupTimer);
}

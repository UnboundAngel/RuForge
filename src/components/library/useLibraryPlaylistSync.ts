import { useEffect } from "react";
import type { PlaylistCollection } from "@/types";
import { loadDiskPlaylistMeta } from "@/lib/diskPlaylistMeta";
import { loadPlaylistSeen, stampUnseenPlaylists } from "@/lib/playlistSeen";
import { loadPendingJoins } from "./pendingJoins";
import { isVirtualPlaylistPath } from "@/virtualPlaylists";
import { useRuforgeStore } from "@/store/ruforgeStore";

/**
 * Loads what the Playlists page needs from disk: custom order and names of downloaded playlist
 * folders, and the last-opened times behind the New badge (first run stamps existing folders).
 */
export function useLibraryPlaylistSync(playlists: readonly PlaylistCollection[]): void {
  const refresh = useRuforgeStore((s) => s.refreshVirtualPlaylists);

  useEffect(() => {
    void loadPendingJoins();
  }, []);

  useEffect(() => {
    const folders = playlists.filter((p) => !isVirtualPlaylistPath(p.path)).map((p) => p.path);
    if (folders.length === 0) return;
    let live = true;
    void loadDiskPlaylistMeta(folders).then((found) => {
      if (live && found) refresh();
    });
    void loadPlaylistSeen().then((firstRun) => {
      if (live && firstRun) stampUnseenPlaylists(folders);
    });
    return () => {
      live = false;
    };
  }, [playlists, refresh]);
}

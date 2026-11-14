import { clearPlaybackPos, isVideoWatched, readStoredPlaybackDuration, writePlaybackPos } from "../../playbackStorage";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { parseVirtualPlaylistId } from "../../virtualPlaylists";
import { findPlaylistEntry, keyedItems, videoItems } from "./playback";
import { canonicalPlaylistId } from "./state";

/** Marks items watched or unwatched through the same saved positions the library badges read. */
export function markItemsWatched(playlistId: string, keys: string[], watched: boolean): void {
  const entry = findPlaylistEntry(playlistId);
  if (!entry || keys.length === 0) return;
  const { byKey } = keyedItems(entry);
  for (const key of keys) {
    const file = byKey.get(key);
    if (!file) continue;
    if (!watched) {
      clearPlaybackPos(file.path);
      continue;
    }
    // Unknown length still needs a duration for the position to read as finished.
    const dur = file.duration > 0 ? file.duration : readStoredPlaybackDuration(file.path) || 1;
    writePlaybackPos(file.path, dur, dur);
  }
  useRuforgeStore.getState().refreshVirtualPlaylists();
}

/** Drops every watched video from a virtual playlist; folder playlists are left alone. */
export async function removeWatched(playlistId: string): Promise<void> {
  const entry = findPlaylistEntry(playlistId);
  if (!entry || parseVirtualPlaylistId(entry.path) !== canonicalPlaylistId(playlistId)) return;
  const watched = videoItems(entry)
    .filter((f) => isVideoWatched(f.path, f.duration))
    .map((f) => f.path);
  if (watched.length === 0) return;
  useRuforgeStore.getState().removePathsFromVirtualPlaylist(canonicalPlaylistId(playlistId), watched);
}

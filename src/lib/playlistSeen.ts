import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { PlaylistCollection } from "@/types";
import { isVirtualPlaylistPath } from "@/virtualPlaylists";

/** When each playlist was last opened, keyed by playlist path. Lives in `app_data/playlist-seen.json`. */
type SeenState = { seen: Record<string, number>; loaded: boolean };

export const usePlaylistSeen = create<SeenState>(() => ({ seen: {}, loaded: false }));

let writing = false;
let pending: string | null = null;

async function drainWrites(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pending != null) {
      const contents = pending;
      pending = null;
      try {
        await invoke("write_playlist_seen_file", { contents });
      } catch (e) {
        console.warn("playlist seen file write failed", e);
      }
    }
  } finally {
    writing = false;
  }
}

function persist(seen: Record<string, number>): void {
  pending = JSON.stringify({ seen });
  void drainWrites();
}

let loadPromise: Promise<boolean> | null = null;

/** Reads the seen file once. Resolves true when there was none yet (first run on this version). */
export function loadPlaylistSeen(): Promise<boolean> {
  loadPromise ??= (async () => {
    let seen: Record<string, number> = {};
    let firstRun = true;
    try {
      const raw = await invoke<string | null>("read_playlist_seen_file");
      const parsed = raw ? (JSON.parse(raw) as { seen?: Record<string, number> }) : null;
      if (parsed?.seen && typeof parsed.seen === "object") {
        seen = parsed.seen;
        firstRun = false;
      }
    } catch (e) {
      console.warn("playlist seen file read failed", e);
      firstRun = false;
    }
    // Marks made before the read finished win; they are newer.
    usePlaylistSeen.setState((s) => ({ seen: { ...seen, ...s.seen }, loaded: true }));
    return firstRun;
  })();
  return loadPromise;
}

export function markPlaylistSeen(path: string, at = Date.now()): void {
  const state = usePlaylistSeen.getState();
  const seen = { ...state.seen, [path]: at };
  usePlaylistSeen.setState({ seen });
  if (state.loaded) persist(seen);
}

/** First run only: today's date for every existing playlist, so an update does not badge them all. */
export function stampUnseenPlaylists(paths: string[]): void {
  const state = usePlaylistSeen.getState();
  if (!state.loaded) return;
  const missing = paths.filter((p) => state.seen[p] === undefined);
  if (missing.length === 0) return;
  const now = Date.now();
  const seen = { ...state.seen };
  for (const p of missing) seen[p] = now;
  usePlaylistSeen.setState({ seen });
  persist(seen);
}

/** Newest file date in a playlist folder, in ms. */
export function newestAddition(playlist: PlaylistCollection): number {
  // Scans report file creation in seconds.
  return playlist.items.reduce((max, f) => Math.max(max, f.created * 1000), 0);
}

/**
 * Downloaded playlist folders only: videos arrive on their own there (downloads, playlist watch).
 * A video playlist changes only when the user edits it. A folder never opened counts as new.
 */
export function playlistHasNew(playlist: PlaylistCollection, seen: Record<string, number>): boolean {
  if (isVirtualPlaylistPath(playlist.path)) return false;
  const at = seen[playlist.path];
  if (at === undefined) return playlist.itemCount > 0;
  return newestAddition(playlist) > at;
}

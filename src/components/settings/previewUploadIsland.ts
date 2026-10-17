import { getCurrentWindow } from "@tauri-apps/api/window";

import { useWatchlistStore } from "@/watchlist/watchlistStore";

const PREVIEW_COUNT = 3;

/**
 * Dev aid: stage the newest unseen uploads as an island batch, then minimize main so the overlay
 * shows them. Only the batch ids and timestamp change; upload seen state is never touched.
 * Returns false when there is nothing unseen, since the island only shows unseen uploads.
 */
export async function previewUploadIsland(): Promise<boolean> {
  const { snapshot } = useWatchlistStore.getState();
  const unseen = (snapshot?.uploads ?? [])
    .filter((u) => !u.seen)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, PREVIEW_COUNT);
  if (unseen.length === 0) return false;

  useWatchlistStore.setState({
    islandBatchIds: unseen.map((u) => u.videoId),
    islandBatchAt: Date.now(),
  });
  await getCurrentWindow().minimize();
  return true;
}

import {
  ISLAND_WATCHLIST_MAX_FACES,
  ISLAND_WATCHLIST_MAX_ROWS,
  type IslandWatchlist,
} from "@/components/island/IslandWatchlistContent";
import type { WatchlistSnapshot } from "./types";

export const ISLAND_WATCHLIST_TAKEOVER_MS = 8000;

type IslandBatchState = {
  snapshot: WatchlistSnapshot | null;
  islandBatchIds: readonly string[];
  islandBatchAt: number;
};

/** Null once every upload in the batch has been seen (queued, opened, or marked elsewhere). */
export function buildIslandWatchlist(
  state: IslandBatchState,
  avatarSrc: (channelId: string) => string | null,
  now: number,
): IslandWatchlist | null {
  if (!state.snapshot || state.islandBatchIds.length === 0) return null;
  const batch = new Set(state.islandBatchIds);
  const uploads = state.snapshot.uploads.filter((u) => batch.has(u.videoId) && !u.seen);
  if (uploads.length === 0) return null;

  const faces: IslandWatchlist["faces"] = [];
  const faceChannels = new Set<string>();
  for (const u of uploads) {
    if (faces.length >= ISLAND_WATCHLIST_MAX_FACES) break;
    if (faceChannels.has(u.channelId)) continue;
    faceChannels.add(u.channelId);
    faces.push({
      src: avatarSrc(u.channelId),
      initial: u.channelTitle.trim().charAt(0).toUpperCase() || "?",
    });
  }

  return {
    key: `${state.islandBatchAt}:${uploads.map((u) => u.videoId).join(",")}`,
    count: uploads.length,
    faces,
    rows: uploads.slice(0, ISLAND_WATCHLIST_MAX_ROWS).map((u) => ({
      videoId: u.videoId,
      title: u.title,
      channel: u.channelTitle,
      thumbnail: u.thumbnail,
      upcoming: u.liveStatus !== "none",
      live: u.liveStatus === "live",
    })),
    takeover: now - state.islandBatchAt < ISLAND_WATCHLIST_TAKEOVER_MS,
  };
}

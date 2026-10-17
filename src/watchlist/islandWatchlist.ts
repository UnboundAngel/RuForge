import {
  ISLAND_WATCHLIST_MAX_FACES,
  ISLAND_WATCHLIST_MAX_ROWS,
  type IslandWatchlist,
} from "@/components/island/IslandWatchlistContent";
import type { WatchlistSnapshot } from "./types";

/** Fresh batch: beats the music pill for a few seconds. */
export const ISLAND_WATCHLIST_TAKEOVER_MS = 8000;
/** Total time the pill is shown per batch. The uploads stay unseen in the bell after this. */
export const ISLAND_WATCHLIST_DWELL_MS = 12_000;
/** After the pointer leaves the pill or expanded panel, the pill lingers this long before it can lapse. */
export const ISLAND_WATCHLIST_HOLD_GRACE_MS = 1500;

type IslandBatchState = {
  snapshot: WatchlistSnapshot | null;
  islandBatchIds: readonly string[];
  islandBatchAt: number;
};

/**
 * `keepUntil` pins the pill past its dwell: Infinity while the pointer is on it, or a grace
 * deadline after the pointer leaves. Null once every upload in the batch has been seen.
 */
export function buildIslandWatchlist(
  state: IslandBatchState,
  avatarSrc: (channelId: string) => string | null,
  now: number,
  keepUntil = 0,
): IslandWatchlist | null {
  if (!state.snapshot || state.islandBatchIds.length === 0) return null;
  const batch = new Set(state.islandBatchIds);
  const uploads = state.snapshot.uploads.filter((u) => batch.has(u.videoId) && !u.seen);
  if (uploads.length === 0) return null;
  const age = now - state.islandBatchAt;
  if (age >= ISLAND_WATCHLIST_DWELL_MS && now >= keepUntil) return null;

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
    takeover: age < ISLAND_WATCHLIST_TAKEOVER_MS,
  };
}

/** Next moment the pill's visibility can change without new input, or null when nothing is pending. */
export function islandWatchlistLapseAt(batchAt: number, now: number, keepUntil: number): number | null {
  const candidates = [
    batchAt + ISLAND_WATCHLIST_TAKEOVER_MS,
    batchAt + ISLAND_WATCHLIST_DWELL_MS,
    keepUntil,
  ].filter((t) => Number.isFinite(t) && t > now);
  return candidates.length === 0 ? null : Math.min(...candidates);
}

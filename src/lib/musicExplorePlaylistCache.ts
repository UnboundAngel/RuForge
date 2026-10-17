import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import { extractYouTubePlaylistId, normalizeYouTubeUrlForCompare } from "@/youtubeUrl";

export type CachedMusicExplorePlaylist = {
  playlistTitle: string;
  playlistUrl: string;
  items: MusicTrackInfo[];
  hasMore: boolean;
  total: number | null;
};

function cacheKeyForUrl(url: string): string {
  const playlistId = extractYouTubePlaylistId(url);
  if (playlistId) return `playlist:${playlistId}`;
  return normalizeYouTubeUrlForCompare(url);
}

/** Each entry holds a full track list (a big playlist is ~0.5 MB), so keep only the most recent. */
const MAX_CACHED_PLAYLISTS = 12;

const sessionCache = new Map<string, CachedMusicExplorePlaylist>();

export function getCachedMusicExplorePlaylist(
  url: string,
): CachedMusicExplorePlaylist | null {
  const key = cacheKeyForUrl(url);
  const hit = sessionCache.get(key);
  if (!hit) return null;
  sessionCache.delete(key);
  sessionCache.set(key, hit);
  return hit;
}

export function setCachedMusicExplorePlaylist(
  url: string,
  entry: CachedMusicExplorePlaylist,
): void {
  const key = cacheKeyForUrl(url);
  sessionCache.delete(key);
  sessionCache.set(key, entry);
  while (sessionCache.size > MAX_CACHED_PLAYLISTS) {
    const oldest = sessionCache.keys().next().value;
    if (oldest === undefined) break;
    sessionCache.delete(oldest);
  }
}

export function patchCachedMusicExplorePlaylistItems(
  url: string,
  items: MusicTrackInfo[],
  hasMore?: boolean,
  total?: number | null,
): void {
  const key = cacheKeyForUrl(url);
  const existing = sessionCache.get(key);
  if (!existing) return;
  sessionCache.set(key, {
    ...existing,
    items,
    ...(hasMore !== undefined ? { hasMore } : {}),
    ...(total !== undefined ? { total } : {}),
  });
}

/** Test helper — not used in production UI. */
export function clearMusicExplorePlaylistCacheForTests(): void {
  sessionCache.clear();
}

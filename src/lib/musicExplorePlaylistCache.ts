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

const sessionCache = new Map<string, CachedMusicExplorePlaylist>();

export function getCachedMusicExplorePlaylist(
  url: string,
): CachedMusicExplorePlaylist | null {
  const key = cacheKeyForUrl(url);
  return sessionCache.get(key) ?? null;
}

export function setCachedMusicExplorePlaylist(
  url: string,
  entry: CachedMusicExplorePlaylist,
): void {
  sessionCache.set(cacheKeyForUrl(url), entry);
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

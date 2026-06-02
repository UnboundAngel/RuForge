import type { MusicPlaylistPage, MusicTrackInfo } from "@/lib/musicExploreTracks";
import {
  canonicalMusicYouTubeUrl,
  extractYouTubePlaylistId,
  youtubeUrlsMatch,
} from "@/youtubeUrl";

/** Raw track row emitted by the YTM webview harvest probe. */
export type MusicExploreHarvestedTrackPayload = {
  videoId: string;
  title: string;
  durationSeconds: number | null;
  artist: string | null;
  thumbnail: string | null;
};

export type MusicExploreHarvestedTracklist = {
  harvestSourceUrl: string;
  playlistUrl: string | null;
  browseTargetUrl: string | null;
  shelfKind: "musicShelfRenderer" | "musicPlaylistShelfRenderer" | null;
  headerTrackCount: number | null;
  hasContinuation: boolean;
  tracks: MusicExploreHarvestedTrackPayload[];
};

function normalizeCompareUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const listId = extractYouTubePlaylistId(trimmed);
  if (listId) return `https://music.youtube.com/playlist?list=${listId}`;
  return canonicalMusicYouTubeUrl(trimmed) ?? trimmed;
}

/** True when harvested JSON applies to the panel / doLoad URL. */
export function harvestedTracklistAppliesToUrl(
  harvest: MusicExploreHarvestedTracklist,
  panelUrl: string,
): boolean {
  const target = normalizeCompareUrl(panelUrl);
  if (!target) return false;
  const candidates = [
    harvest.harvestSourceUrl,
    harvest.playlistUrl,
    harvest.browseTargetUrl,
  ]
    .filter((u): u is string => Boolean(u?.trim()))
    .map(normalizeCompareUrl);
  return candidates.some((c) => youtubeUrlsMatch(c, target) || c === target);
}

/**
 * Mandatory completeness gate: never treat a partial browse shelf as complete.
 * Falls back to yt-dlp when header count exceeds harvest, continuation remains, or rows are empty.
 */
export function isHarvestTracklistComplete(harvest: MusicExploreHarvestedTracklist): boolean {
  const count = harvest.tracks.length;
  if (count === 0) return false;
  if (harvest.hasContinuation) return false;
  if (
    harvest.headerTrackCount != null
    && count < harvest.headerTrackCount
  ) {
    return false;
  }
  return true;
}

export function harvestedTrackToMusicTrackInfo(
  track: MusicExploreHarvestedTrackPayload,
  albumTitle: string | null,
): MusicTrackInfo {
  const videoId = track.videoId.trim();
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return {
    id: videoId,
    title: track.title.trim() || videoId,
    url,
    duration: track.durationSeconds != null && track.durationSeconds > 0
      ? track.durationSeconds
      : null,
    thumbnail: track.thumbnail?.trim() || null,
    artist: track.artist?.trim() || null,
    album: albumTitle,
  };
}

export function harvestedTracklistToPlaylistPage(
  harvest: MusicExploreHarvestedTracklist,
  playlistUrl: string,
  playlistTitle: string,
): MusicPlaylistPage {
  const albumTitle = harvest.shelfKind === "musicShelfRenderer" ? playlistTitle : null;
  const items = harvest.tracks.map((t) => harvestedTrackToMusicTrackInfo(t, albumTitle));
  const total = harvest.headerTrackCount ?? items.length;
  return {
    items,
    hasMore: false,
    total,
    title: playlistTitle,
  };
}

export function tryPlaylistPageFromHarvest(
  harvest: MusicExploreHarvestedTracklist | null | undefined,
  panelUrl: string,
  playlistTitle: string,
): MusicPlaylistPage | null {
  if (!harvest) return null;
  if (!harvestedTracklistAppliesToUrl(harvest, panelUrl)) return null;
  if (!isHarvestTracklistComplete(harvest)) return null;
  return harvestedTracklistToPlaylistPage(
    harvest,
    panelUrl,
    playlistTitle,
  );
}

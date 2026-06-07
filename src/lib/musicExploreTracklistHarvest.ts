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

/** YTM browse API caps musicShelfRenderer responses at this row count (live: Debussy 531 → 200). */
export const BROWSE_SHELF_TRUNCATION_BOUNDARY = 200;

/**
 * Panel wait before yt-dlp on playlist/album URLs. Live YTM timing (2026-06-02 CDP):
 * `yt-navigate-finish` fires with empty browse.data; shelf JSON lands asynchronously,
 * typically ~100–800ms on album/OLAK pages, occasionally up to ~1.5s.
 */
export const HARVEST_PANEL_WAIT_MS = 1500;
export const HARVEST_PANEL_POLL_MS = 100;

/** Webview browse-data poll after navigation (see armBrowseDataWatcher in explorerProfileScript). */
export const HARVEST_BROWSE_POLL_MS = 100;
export const HARVEST_BROWSE_POLL_MAX_MS = 4000;

function delayMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Mandatory completeness gate (fail-safe): only accept harvest when completeness is
 * positively confirmed via a parsed header count that matches harvested rows.
 * Falls back to yt-dlp when header is missing/unparseable, continuation remains,
 * rows are empty, or browse shelf hits the known truncation boundary.
 */
export function isHarvestTracklistComplete(harvest: MusicExploreHarvestedTracklist): boolean {
  const count = harvest.tracks.length;
  if (count === 0) return false;
  if (harvest.hasContinuation) return false;

  const header = harvest.headerTrackCount;
  if (header != null) {
    return count >= header;
  }

  if (
    harvest.shelfKind === "musicShelfRenderer"
    && count >= BROWSE_SHELF_TRUNCATION_BOUNDARY
  ) {
    return false;
  }

  return false;
}

export type HarvestWaitState = "complete" | "not_ready" | "bail";

/** True when the panel URL could receive harvest from the current webview page. */
export function panelUrlCouldMatchWebviewHarvest(
  panelUrl: string,
  webviewPageUrls: readonly string[] | null | undefined,
): boolean {
  if (!webviewPageUrls?.length) return false;
  const target = normalizeCompareUrl(panelUrl);
  if (!target) return false;
  return webviewPageUrls.some((raw) => {
    const candidate = normalizeCompareUrl(raw);
    return Boolean(candidate) && (youtubeUrlsMatch(candidate, target) || candidate === target);
  });
}

/**
 * Classify whether to accept harvest, keep waiting, or bail to yt-dlp immediately.
 * Uses existing harvest fields only (hasContinuation, tracks, shelfKind, headerTrackCount).
 */
export function classifyHarvestWaitState(
  harvest: MusicExploreHarvestedTracklist | null | undefined,
  panelUrl: string,
  webviewPageUrls?: readonly string[] | null,
): HarvestWaitState {
  if (!harvest) {
    return panelUrlCouldMatchWebviewHarvest(panelUrl, webviewPageUrls)
      ? "not_ready"
      : "bail";
  }
  if (!harvestedTracklistAppliesToUrl(harvest, panelUrl)) {
    return "bail";
  }
  if (isHarvestTracklistComplete(harvest)) {
    return "complete";
  }
  if (harvest.hasContinuation) {
    return "not_ready";
  }
  return "bail";
}

/** Poll props/ref for a verified-complete harvest before committing to yt-dlp. */
export async function waitForCompleteHarvestPlaylist(
  getHarvest: () => MusicExploreHarvestedTracklist | null | undefined,
  panelUrl: string,
  playlistTitle: string,
  signal: AbortSignal,
  getWebviewPageUrls?: () => readonly string[] | null | undefined,
): Promise<MusicPlaylistPage | null> {
  const evaluate = () => {
    const harvest = getHarvest();
    const webviewPageUrls = getWebviewPageUrls?.();
    const state = classifyHarvestWaitState(harvest, panelUrl, webviewPageUrls);
    if (state === "complete") {
      return {
        state,
        page: tryPlaylistPageFromHarvest(harvest, panelUrl, playlistTitle),
      };
    }
    return { state, page: null as MusicPlaylistPage | null };
  };

  let { state, page } = evaluate();
  if (state === "complete" && page) return page;
  if (state === "bail") return null;

  const deadline = Date.now() + HARVEST_PANEL_WAIT_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) return null;
    await delayMs(HARVEST_PANEL_POLL_MS, signal);
    if (signal.aborted) return null;
    ({ state, page } = evaluate());
    if (state === "complete" && page) return page;
    if (state === "bail") return null;
  }

  ({ state, page } = evaluate());
  if (state === "complete" && page) return page;
  return null;
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
  _playlistUrl: string,
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

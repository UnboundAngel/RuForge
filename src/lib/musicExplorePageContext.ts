import type { MusicExploreHarvestedTracklist } from "@/lib/musicExploreTracklistHarvest";
import {
  canonicalMusicYouTubeUrl,
  canonicalYouTubePlaylistUrl,
  classifyMusicExploreUrl,
  extractYouTubePlaylistId,
  isMusicYouTubePlaylistUrl,
  isMusicYouTubeUrl,
  isMusicYouTubeWatchUrl,
  resolveMusicExplorePasteUrl,
} from "@/youtubeUrl";

export type MusicExplorePageKind =
  | "home"
  | "search"
  | "library"
  | "playlist"
  | "watch"
  | "browse"
  | "artist"
  | "album"
  | "channel"
  | "other";

export type MusicExploreShelfLink = {
  title: string;
  url: string;
};

/** Payload from the injected YTM webview script (`music-explore-page-context`). */
export type MusicExplorePageContextPayload = {
  url: string;
  kind: MusicExplorePageKind;
  pageTitle?: string | null;
  playlistUrl?: string | null;
  isPlaylistPage?: boolean;
  /** Prefer this over channel home when loading artist Albums/Browse shelves. */
  browseTargetUrl?: string | null;
  shelfLinks?: MusicExploreShelfLink[] | null;
  /** Tracklist harvested from ytmusic-browse-response.data (album / OLAK shelf). */
  harvestedTracklist?: MusicExploreHarvestedTracklist | null;
};

export type MusicExplorePageContext = {
  url: string;
  kind: MusicExplorePageKind;
  pageTitle: string | null;
  /** Best URL for download-all / pick-tracks actions. */
  actionUrl: string | null;
  /** YTM page to pass to yt-dlp for shelf/album discovery (Browse/Albums tab). */
  browseTargetUrl: string | null;
  /** Album/playlist links scraped from visible shelves in the webview. */
  shelfLinks: MusicExploreShelfLink[];
  /** Complete album/playlist tracklist from webview JSON when harvest gate passes. */
  harvestedTracklist: MusicExploreHarvestedTracklist | null;
  hint: string;
  canDownloadPlaylist: boolean;
  canPickTracks: boolean;
  canDownloadTrack: boolean;
};

const PAGE_HINTS: Record<MusicExplorePageKind, string> = {
  home: "Home — search for music or paste a link to download",
  search: "Search — play a song to auto-save, or paste a playlist link",
  library: "Library — open a playlist to download it",
  playlist: "Playlist — download every track or pick individual songs",
  watch: "Song — auto-save grabs this track while it plays",
  browse: "Browse — use Pick tracks to see what you can download",
  artist: "Artist — open Albums or Browse, then Pick tracks",
  album: "Album — pick tracks from the sidebar to download",
  channel: "Channel — browse playlists and albums to download",
  other: "Paste a music link or use Pick tracks on this page",
};

function kindFromUrl(url: string): MusicExplorePageKind {
  const trimmed = url.trim();
  if (!trimmed) return "other";

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.replace(/^www\./i, "").toLowerCase() !== "music.youtube.com") {
      return "other";
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "/";

    if (path === "/") return "home";
    if (path.startsWith("/search")) return "search";
    if (path.startsWith("/library")) return "library";
    if (path.startsWith("/watch")) {
      if (parsed.searchParams.get("list")) return "playlist";
      return "watch";
    }
    if (path.startsWith("/playlist")) return "playlist";
    if (path.startsWith("/channel")) return "channel";
    if (path.startsWith("/@")) return "artist";
    if (path.startsWith("/browse")) return "browse";
  } catch {
    /* fall through */
  }

  const classified = classifyMusicExploreUrl(trimmed);
  if (classified === "playlist") return "playlist";
  if (classified === "watch") return "watch";
  if (classified === "browse") return "browse";
  return "other";
}

function normalizeShelfLinks(raw?: MusicExploreShelfLink[] | null): MusicExploreShelfLink[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: MusicExploreShelfLink[] = [];
  for (const link of raw) {
    const url = link.url?.trim();
    const title = link.title?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: title || url, url });
    if (out.length >= 50) break;
  }
  return out;
}

function resolveBrowseTargetUrl(
  url: string,
  kind: MusicExplorePageKind,
  browseTargetUrl?: string | null,
): string | null {
  const fromPayload = browseTargetUrl?.trim();
  if (fromPayload) {
    return (
      resolveMusicExplorePasteUrl(fromPayload)
      ?? canonicalMusicYouTubeUrl(fromPayload)
      ?? fromPayload
    );
  }
  if (kind === "browse" || kind === "album") {
    return resolveMusicExplorePasteUrl(url) ?? canonicalMusicYouTubeUrl(url);
  }
  return null;
}

function resolveActionUrl(url: string, playlistUrl?: string | null): string | null {
  const fromPlaylist = playlistUrl?.trim();
  if (fromPlaylist) {
    return (
      resolveMusicExplorePasteUrl(fromPlaylist)
      ?? canonicalMusicYouTubeUrl(fromPlaylist)
      ?? canonicalYouTubePlaylistUrl(fromPlaylist)
      ?? fromPlaylist
    );
  }

  const resolved = resolveMusicExplorePasteUrl(url);
  if (resolved) return resolved;

  const canonical = canonicalMusicYouTubeUrl(url);
  if (canonical) return canonical;

  const playlist = canonicalYouTubePlaylistUrl(url);
  if (playlist) return playlist;

  return url.trim() || null;
}

function normalizeHarvestedTracklist(
  raw?: MusicExploreHarvestedTracklist | null,
): MusicExploreHarvestedTracklist | null {
  if (!raw?.tracks?.length) return null;
  const tracks = raw.tracks
    .map((t) => ({
      videoId: t.videoId?.trim() ?? "",
      title: t.title?.trim() ?? "",
      durationSeconds: t.durationSeconds ?? null,
      artist: t.artist?.trim() || null,
      thumbnail: t.thumbnail?.trim() || null,
    }))
    .filter((t) => t.videoId.length >= 11 && t.title.length > 0);
  if (tracks.length === 0) return null;
  return {
    harvestSourceUrl: raw.harvestSourceUrl?.trim() || "",
    playlistUrl: raw.playlistUrl?.trim() || null,
    browseTargetUrl: raw.browseTargetUrl?.trim() || null,
    shelfKind: raw.shelfKind ?? null,
    headerTrackCount:
      typeof raw.headerTrackCount === "number" && raw.headerTrackCount > 0
        ? raw.headerTrackCount
        : null,
    hasContinuation: Boolean(raw.hasContinuation),
    tracks,
  };
}

function buildContext(
  url: string,
  kind: MusicExplorePageKind,
  pageTitle: string | null,
  actionUrl: string | null,
  browseTargetUrl: string | null,
  shelfLinks: MusicExploreShelfLink[],
  harvestedTracklist: MusicExploreHarvestedTracklist | null,
): MusicExplorePageContext {
  const hasPlaylistListId = Boolean(
    actionUrl && (isMusicYouTubePlaylistUrl(actionUrl) || extractYouTubePlaylistId(actionUrl)),
  );
  const isPlaylist = kind === "playlist" || hasPlaylistListId;
  const isWatch = kind === "watch" || Boolean(actionUrl && isMusicYouTubeWatchUrl(actionUrl));
  const isBrowsable =
    kind === "browse"
    || kind === "artist"
    || kind === "album"
    || kind === "channel"
    || Boolean(actionUrl && isMusicYouTubeUrl(actionUrl));

  return {
    url,
    kind: isPlaylist ? "playlist" : kind,
    pageTitle,
    actionUrl,
    browseTargetUrl,
    shelfLinks,
    harvestedTracklist,
    hint: PAGE_HINTS[isPlaylist ? "playlist" : kind],
    canDownloadPlaylist: hasPlaylistListId,
    canPickTracks: isPlaylist || isBrowsable || isWatch,
    canDownloadTrack: isWatch && Boolean(actionUrl),
  };
}

function isArtistOrChannelHomeUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.replace(/^www\./i, "").toLowerCase() !== "music.youtube.com") {
      return false;
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return path.startsWith("/@") || path.startsWith("/channel/");
  } catch {
    return false;
  }
}

function isSingleAlbumBrowseUrl(url: string): boolean {
  return /music\.youtube\.com\/browse\/MPAD/i.test(url);
}

/** Panel / yt-dlp load URL: paste, then playlist action, then browse tab (not first shelf), then live page. */
export function resolveExplorePanelUrl(
  pasteUrl: string,
  context: Pick<MusicExplorePageContext, "browseTargetUrl" | "actionUrl">,
  currentMusicExploreUrl: string,
): string {
  const pasted = pasteUrl.trim();
  if (pasted) return pasted;
  const action = context.actionUrl?.trim();
  if (
    action
    && (isMusicYouTubePlaylistUrl(action) || extractYouTubePlaylistId(action))
  ) {
    return action;
  }
  const browseTarget = context.browseTargetUrl?.trim();
  const current = currentMusicExploreUrl.trim();
  if (browseTarget) {
    if (isArtistOrChannelHomeUrl(current) && isSingleAlbumBrowseUrl(browseTarget)) {
      return current;
    }
    return browseTarget;
  }
  if (action) return action;
  return current;
}

/** URL-only fallback when the webview has not emitted page context yet. */
export function classifyMusicExplorePageFromUrl(url: string): MusicExplorePageContext {
  const kind = kindFromUrl(url);
  const actionUrl = resolveActionUrl(url);
  const browseTargetUrl = resolveBrowseTargetUrl(url, kind);
  return buildContext(url, kind, null, actionUrl, browseTargetUrl, [], null);
}

export function mergeMusicExplorePageContext(
  url: string,
  payload?: MusicExplorePageContextPayload | null,
): MusicExplorePageContext {
  const effectiveUrl = payload?.url?.trim() || url.trim();
  if (!effectiveUrl) {
    return buildContext("", "other", null, null, null, [], null);
  }

  let kind = payload?.kind ?? kindFromUrl(effectiveUrl);
  const pageTitle = payload?.pageTitle?.trim() || null;
  const shelfLinks = normalizeShelfLinks(payload?.shelfLinks);
  const harvestedTracklist = normalizeHarvestedTracklist(payload?.harvestedTracklist);

  if (payload?.isPlaylistPage || payload?.playlistUrl) {
    kind = "playlist";
  } else if (kind === "browse" && pageTitle) {
    const lower = pageTitle.toLowerCase();
    if (lower.includes("playlist")) kind = "playlist";
    else if (lower.includes("album")) kind = "album";
  }

  const actionUrl = resolveActionUrl(effectiveUrl, payload?.playlistUrl);
  const browseTargetUrl = resolveBrowseTargetUrl(
    effectiveUrl,
    kind,
    payload?.browseTargetUrl,
  );

  return buildContext(
    effectiveUrl,
    kind,
    pageTitle,
    actionUrl,
    browseTargetUrl,
    shelfLinks,
    harvestedTracklist,
  );
}

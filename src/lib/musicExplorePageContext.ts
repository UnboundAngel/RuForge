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

/** Payload from the injected YTM webview script (`music-explore-page-context`). */
export type MusicExplorePageContextPayload = {
  url: string;
  kind: MusicExplorePageKind;
  pageTitle?: string | null;
  playlistUrl?: string | null;
  isPlaylistPage?: boolean;
};

export type MusicExplorePageContext = {
  url: string;
  kind: MusicExplorePageKind;
  pageTitle: string | null;
  /** Best URL for download-all / pick-tracks actions. */
  actionUrl: string | null;
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
  artist: "Artist — browse their playlists, then download",
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

function buildContext(
  url: string,
  kind: MusicExplorePageKind,
  pageTitle: string | null,
  actionUrl: string | null,
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
    hint: PAGE_HINTS[isPlaylist ? "playlist" : kind],
    canDownloadPlaylist: hasPlaylistListId,
    canPickTracks: isPlaylist || isBrowsable || isWatch,
    canDownloadTrack: isWatch && Boolean(actionUrl),
  };
}

/** URL-only fallback when the webview has not emitted page context yet. */
export function classifyMusicExplorePageFromUrl(url: string): MusicExplorePageContext {
  const kind = kindFromUrl(url);
  const actionUrl = resolveActionUrl(url);
  return buildContext(url, kind, null, actionUrl);
}

export function mergeMusicExplorePageContext(
  url: string,
  payload?: MusicExplorePageContextPayload | null,
): MusicExplorePageContext {
  const effectiveUrl = payload?.url?.trim() || url.trim();
  if (!effectiveUrl) {
    return buildContext("", "other", null, null);
  }

  let kind = payload?.kind ?? kindFromUrl(effectiveUrl);
  const pageTitle = payload?.pageTitle?.trim() || null;

  if (payload?.isPlaylistPage || payload?.playlistUrl) {
    kind = "playlist";
  } else if (kind === "browse" && pageTitle) {
    const lower = pageTitle.toLowerCase();
    if (lower.includes("playlist")) kind = "playlist";
    else if (lower.includes("album")) kind = "album";
  }

  const actionUrl = resolveActionUrl(effectiveUrl, payload?.playlistUrl);
  return buildContext(effectiveUrl, kind, pageTitle, actionUrl);
}

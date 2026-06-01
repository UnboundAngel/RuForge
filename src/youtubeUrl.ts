const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YT_PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,}$/;

function isYoutubeHost(host: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return (
    h === "youtube.com" ||
    h === "m.youtube.com" ||
    h === "music.youtube.com" ||
    h === "youtu.be"
  );
}

function parseYoutubeUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** Canonical playlist id from `list=` or `/playlist?list=`, or null. */
export function extractYouTubePlaylistId(input: string): string | null {
  const url = parseYoutubeUrl(input);
  if (!url || !isYoutubeHost(url.hostname)) return null;

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "youtu.be") return null;

  const list = url.searchParams.get("list")?.trim();
  if (list && YT_PLAYLIST_ID_RE.test(list)) return list;

  if (/^\/playlist\/?$/i.test(url.pathname)) {
    const fromPath = url.searchParams.get("list")?.trim();
    if (fromPath && YT_PLAYLIST_ID_RE.test(fromPath)) return fromPath;
  }

  return null;
}

/** Stable https playlist URL, or null if not a playlist link. */
export function canonicalYouTubePlaylistUrl(input: string): string | null {
  const id = extractYouTubePlaylistId(input);
  if (!id) return null;
  return `https://www.youtube.com/playlist?list=${id}`;
}

/** Canonical 11-char YouTube video id, or null if not a recognizable watch URL. */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const short = trimmed.match(/(?:^|\/\/)(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (short?.[1] && YT_ID_RE.test(short[1])) return short[1];

  const url = parseYoutubeUrl(trimmed);
  if (!url) return null;

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
    if (YT_ID_RE.test(id)) return id;
  }

  if (isYoutubeHost(url.hostname)) {
    const v = url.searchParams.get("v");
    if (v && YT_ID_RE.test(v)) return v;

    const pathMatch = url.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/i);
    if (pathMatch?.[1] && YT_ID_RE.test(pathMatch[1])) return pathMatch[1];
  }

  return null;
}

const TRACKING_PARAMS = [
  "si",
  "feature",
  "pp",
  "fbclid",
  "gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

function stripTrackingParams(url: URL): void {
  for (const p of TRACKING_PARAMS) url.searchParams.delete(p);
  url.hash = "";
}

/** Stable comparison key: video id, playlist id, or normalized URL string. */
export function normalizeYouTubeUrlForCompare(input: string): string {
  const videoId = extractYouTubeVideoId(input);
  if (videoId) return `youtube:${videoId}`;

  const playlistId = extractYouTubePlaylistId(input);
  if (playlistId) return `youtube:playlist:${playlistId}`;

  try {
    const url = new URL(input.trim());
    stripTrackingParams(url);
    return url.toString().toLowerCase();
  } catch {
    return input.trim().toLowerCase();
  }
}

export function youtubeUrlsMatch(a: string, b: string): boolean {
  const playlistA = extractYouTubePlaylistId(a);
  const playlistB = extractYouTubePlaylistId(b);
  if (playlistA && playlistB) return playlistA === playlistB;

  const idA = extractYouTubeVideoId(a);
  const idB = extractYouTubeVideoId(b);
  if (idA && idB) return idA === idB;

  return normalizeYouTubeUrlForCompare(a) === normalizeYouTubeUrlForCompare(b);
}

/** True when the string is a recognizable YouTube watch or playlist URL. */
export function isYouTubeUrl(input: string): boolean {
  return (
    extractYouTubeVideoId(input) !== null ||
    extractYouTubePlaylistId(input) !== null
  );
}

/**
 * True for `youtube.com/watch` or `m.youtube.com/watch` with a valid `v` id
 * (Explorer header queue control — matches in-webview watch pages, not shorts/embed).
 */
export function isYouTubeDotComWatchPageUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    if (!/^\/watch\/?$/i.test(u.pathname)) return false;
    const v = u.searchParams.get("v");
    return Boolean(v && YT_ID_RE.test(v));
  } catch {
    return false;
  }
}

const YT_URL_IN_TEXT_RE =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/gi;

/**
 * Preferred downloader URL: playlist when `list=` is present, else watch URL.
 */
export function canonicalYouTubeDownloaderUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const playlist = canonicalYouTubePlaylistUrl(trimmed);
  if (playlist) return playlist;

  return canonicalYouTubeWatchUrl(trimmed);
}

/** Stable https watch URL for the downloader field, or null if not YouTube. */
export function canonicalYouTubeWatchUrl(input: string): string | null {
  const id = extractYouTubeVideoId(input);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

/** First YouTube URL in arbitrary clipboard text (playlist preferred when `list=` is set). */
export function extractYouTubeUrlFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = canonicalYouTubeDownloaderUrl(trimmed);
  if (direct) return direct;

  const matches = trimmed.match(YT_URL_IN_TEXT_RE);
  if (!matches) return null;

  for (const candidate of matches) {
    const playlist = canonicalYouTubePlaylistUrl(candidate);
    if (playlist) return playlist;
  }

  for (const candidate of matches) {
    const watch = canonicalYouTubeWatchUrl(candidate);
    if (watch) {
      if (extractYouTubePlaylistId(candidate)) {
        const pl = canonicalYouTubePlaylistUrl(candidate);
        if (pl) return pl;
      }
      return watch;
    }
  }

  return null;
}

/** Stable watch URL for one playlist entry from yt-dlp preview metadata. */
export function playlistItemWatchUrl(item: {
  webpageUrl?: string;
  id?: string;
}): string | null {
  const fromWeb = item.webpageUrl?.trim();
  if (fromWeb) {
    const c = canonicalYouTubeWatchUrl(fromWeb);
    if (c) return c;
  }
  const id = item.id?.trim();
  if (id && YT_ID_RE.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  return null;
}

function isMusicHost(host: string): boolean {
  return host.replace(/^www\./i, "").toLowerCase() === "music.youtube.com";
}

/**
 * Detect if `input` is a music.youtube.com browse URL (artist handle, channel, album page).
 * These are passed as-is to yt-dlp / `get_music_browse_info` rather than normalized to watch URLs.
 */
export function isMusicYouTubeUrl(input: string): boolean {
  const url = parseYoutubeUrl(input);
  if (!url || !isMusicHost(url.hostname)) return false;
  const p = url.pathname;
  return (
    p.startsWith("/@") ||
    p.startsWith("/channel/") ||
    p.startsWith("/browse/") ||
    /^\/playlist\/?$/i.test(p)
  );
}

/**
 * True for music.youtube.com `/watch?v=` with a valid video id and no `list=` param.
 * Watch URLs with `list=` are playlists and handled by `isMusicYouTubePlaylistUrl`.
 */
export function isMusicYouTubeWatchUrl(input: string): boolean {
  const url = parseYoutubeUrl(input);
  if (!url || !isMusicHost(url.hostname)) return false;
  if (!/^\/watch\/?$/i.test(url.pathname)) return false;
  if (url.searchParams.get("list")) return false;
  return extractYouTubeVideoId(input) !== null;
}

export type MusicExploreUrlKind = "playlist" | "browse" | "watch";

/** Route Music Explore paste / sidebar fetch by URL shape. */
export function classifyMusicExploreUrl(input: string): MusicExploreUrlKind | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (isMusicYouTubePlaylistUrl(trimmed)) return "playlist";
  if (extractYouTubePlaylistId(trimmed)) return "playlist";
  if (isMusicYouTubeUrl(trimmed)) return "browse";
  if (isMusicYouTubeWatchUrl(trimmed)) return "watch";

  const url = parseYoutubeUrl(trimmed);
  if (!url || !isYoutubeHost(url.hostname)) return null;
  if (extractYouTubeVideoId(trimmed)) return "watch";

  return null;
}

/** True when Music Explore paste / auto-detect should accept the URL. */
export function isMusicExplorePasteUrl(input: string): boolean {
  return classifyMusicExploreUrl(input) !== null;
}

/**
 * Normalize a pasted Explore URL for fetch or download.
 * Watch links become canonical youtube.com watch URLs; browse/playlist stay on music.youtube.com when applicable.
 */
export function resolveMusicExplorePasteUrl(input: string): string | null {
  const kind = classifyMusicExploreUrl(input);
  if (!kind) return null;

  if (kind === "watch") {
    return canonicalYouTubeWatchUrl(input);
  }

  if (kind === "playlist") {
    const music = canonicalMusicYouTubeUrl(input);
    if (music) return music;
    return canonicalYouTubePlaylistUrl(input);
  }

  return canonicalMusicYouTubeUrl(input);
}

/**
 * True when the URL is a music.youtube.com playlist (has `list=` param).
 * These go to `get_playlist_items_page` directly without the browse step.
 */
export function isMusicYouTubePlaylistUrl(input: string): boolean {
  const url = parseYoutubeUrl(input);
  if (!url || !isMusicHost(url.hostname)) return false;
  const list = url.searchParams.get("list");
  return Boolean(list && YT_PLAYLIST_ID_RE.test(list));
}

/**
 * Return the music.youtube.com URL as-is (cleaned of tracking params) for yt-dlp consumption.
 * Returns null if not a music.youtube.com URL.
 */
export function canonicalMusicYouTubeUrl(input: string): string | null {
  const url = parseYoutubeUrl(input);
  if (!url || !isMusicHost(url.hostname)) return null;
  stripTrackingParams(url);
  return url.toString();
}

/** Build a music.youtube.com search URL for the embedded Explore webview. */
export function youtubeMusicSearchUrl(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const url = new URL("https://music.youtube.com/search");
  url.searchParams.set("q", trimmed);
  return url.toString();
}

/** Match Rust `sanitize_playlist_folder_name` for download/regroup folder names. */
export function sanitizePlaylistFolderName(raw: string): string {
  let s = raw.trim();
  if (!s) return "playlist";
  const forbidden = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
  for (const ch of forbidden) {
    s = s.split(ch).join("_");
  }
  s = s.replace(/\s+/g, " ").trim();
  if (!s.length) return "playlist";
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s || "playlist";
}

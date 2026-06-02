export interface MusicTrackInfo {
  id: string;
  title: string;
  url: string;
  duration: number | null;
  thumbnail: string | null;
  artist: string | null;
  album: string | null;
}

export interface MusicPlaylistPage {
  items: MusicTrackInfo[];
  hasMore: boolean;
  total: number | null;
  title?: string | null;
}

export interface MusicPlaylistInfo {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  trackCount: number | null;
}

export interface MusicBrowseResult {
  title: string;
  thumbnail: string | null;
  playlists: MusicPlaylistInfo[];
  /** `channel_tabs_only` when yt-dlp only returned Videos/Shorts/Live tabs. */
  browseKind?: string | null;
}

/** Skip page URLs mistaken for thumbnails (shows as broken images in Tauri). */
export function isLikelyImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (
    u.includes("youtube.com/playlist")
    || u.includes("music.youtube.com/playlist")
    || u.includes("youtube.com/watch")
    || u.includes("music.youtube.com/watch")
    || u.includes("youtube.com/channel")
    || u.includes("music.youtube.com/channel")
    || u.includes("music.youtube.com/browse")
    || u.includes("youtu.be/")
  ) {
    return false;
  }
  if (
    u.includes("ytimg.com")
    || u.includes("ggpht.com")
    || u.includes("googleusercontent.com")
    || u.includes("gstatic.com")
  ) {
    return true;
  }
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u);
}

/** YouTube channel ids (UC…) are not unique per tab/playlist on artist browse pages. */
export function isYoutubeChannelId(id: string): boolean {
  return /^UC[\w-]{22}$/.test(id.trim());
}

/** Stable React key + selection id: URL first, then disambiguated id, then index. */
export function musicTrackKey(track: MusicTrackInfo, index: number): string {
  const url = track.url?.trim();
  if (url) return url;
  const id = track.id?.trim();
  if (id && !isYoutubeChannelId(id)) return id;
  if (id) return `${id}::${index}`;
  return `idx-${index}`;
}

/** Artist browse tabs may share channel id or URL — disambiguate with title or index. */
export function musicPlaylistKey(pl: MusicPlaylistInfo, index: number): string {
  const url = pl.url?.trim();
  const title = pl.title?.trim();
  if (url && title) return `${url}::${title}`;
  if (url) return url;
  const id = pl.id?.trim();
  if (id && title) return `${id}::${title}`;
  if (id && !isYoutubeChannelId(id)) return id;
  if (id) return `${id}::${index}`;
  return `playlist-${index}`;
}

/** Never use a raw URL as a folder name on disk. */
export function playlistFolderTitle(title: string | null | undefined, url: string): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  try {
    const list = new URL(url).searchParams.get("list");
    if (list) return `Playlist ${list.slice(0, 12)}`;
  } catch {
    /* invalid url */
  }
  return "Playlist";
}

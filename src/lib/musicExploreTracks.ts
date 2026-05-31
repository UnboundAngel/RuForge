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
}

/** Flat-playlist entries often have an empty id; url + index keeps selection stable. */
export function musicTrackKey(track: MusicTrackInfo, index: number): string {
  if (track.id) return track.id;
  if (track.url) return track.url;
  return `idx-${index}`;
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

import { create } from "zustand";
import { bestCoverPath } from "@/mediaKind";
import { artistKeyFromFile, rawArtistFromFile, primaryArtist } from "./musicArtist";
import { fileSongKey, fileVideoId, outsideSongKey } from "./musicOutsideRecommend";
import type { ShelfItem } from "./musicShelfFollowUps";

/**
 * Songs and artists the user never wants recommended again. Hiding only filters the
 * Recommended shelves; it never touches files, playlists, or the library.
 */
export type HiddenSong = {
  id: string;
  title: string;
  artist: string;
  videoId: string | null;
  /** Title and artist, so the same song still matches under another video id or once downloaded. */
  songKey: string | null;
  path: string | null;
  coverPath: string | null;
  thumbnail: string | null;
  hiddenAt: number;
};

export type HiddenArtist = { key: string; name: string; hiddenAt: number };

type HiddenState = { songs: HiddenSong[]; artists: HiddenArtist[] };

const LS_KEY = "ruforge-music-hidden-recommendations";

function load(): HiddenState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { songs: [], artists: [] };
    const parsed = JSON.parse(raw) as Partial<HiddenState>;
    return {
      songs: Array.isArray(parsed.songs) ? parsed.songs : [],
      artists: Array.isArray(parsed.artists) ? parsed.artists : [],
    };
  } catch {
    return { songs: [], artists: [] };
  }
}

function save(state: HiddenState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ songs: state.songs, artists: state.artists }));
  } catch {
    // storage unavailable
  }
}

export const useHiddenRecommendations = create<HiddenState>(() => load());
useHiddenRecommendations.subscribe(save);

/** A title-only key would hide every cover of a song, so it only counts with an artist. */
function usableSongKey(key: string): string | null {
  return key.startsWith("|") ? null : key;
}

/** The artist a card is credited to, keyed the same way for library and YouTube Music cards. */
export function shelfItemArtist(item: ShelfItem): { key: string; name: string } | null {
  if (item.kind === "local") {
    const key = artistKeyFromFile(item.file);
    return key ? { key, name: primaryArtist(rawArtistFromFile(item.file)) } : null;
  }
  const name = item.track.artist.trim();
  return name ? { key: name.toLowerCase(), name } : null;
}

function songRecord(item: ShelfItem, now: number): HiddenSong {
  if (item.kind === "local") {
    const { file } = item;
    const videoId = fileVideoId(file);
    return {
      id: `local:${file.path}`,
      title: file.canonicalTitle ?? file.name,
      artist: shelfItemArtist(item)?.name ?? "",
      videoId,
      songKey: usableSongKey(fileSongKey(file)),
      path: file.path,
      coverPath: bestCoverPath(file) ?? null,
      thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
      hiddenAt: now,
    };
  }
  const { track } = item;
  return {
    id: `yt:${track.videoId}`,
    title: track.title,
    artist: track.artist,
    videoId: track.videoId,
    songKey: usableSongKey(outsideSongKey(track)),
    path: null,
    coverPath: null,
    thumbnail: track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
    hiddenAt: now,
  };
}

export function hideShelfSong(item: ShelfItem, now = Date.now()): HiddenSong {
  const record = songRecord(item, now);
  useHiddenRecommendations.setState((s) => ({ songs: [record, ...s.songs.filter((r) => r.id !== record.id)] }));
  return record;
}

export function hideShelfArtist(item: ShelfItem, now = Date.now()): HiddenArtist | null {
  const artist = shelfItemArtist(item);
  if (!artist) return null;
  const record = { ...artist, hiddenAt: now };
  useHiddenRecommendations.setState((s) => ({ artists: [record, ...s.artists.filter((a) => a.key !== record.key)] }));
  return record;
}

export function unhideSong(id: string): void {
  useHiddenRecommendations.setState((s) => ({ songs: s.songs.filter((r) => r.id !== id) }));
}

export function unhideArtist(key: string): void {
  useHiddenRecommendations.setState((s) => ({ artists: s.artists.filter((a) => a.key !== key) }));
}

/** Whether a card is hidden, by its own id, its video id, its title and artist, or its artist. */
export function makeHiddenMatcher(state: HiddenState): (item: ShelfItem) => boolean {
  if (state.songs.length === 0 && state.artists.length === 0) return () => false;
  const paths = new Set<string>();
  const videoIds = new Set<string>();
  const songKeys = new Set<string>();
  for (const s of state.songs) {
    if (s.path) paths.add(s.path);
    if (s.videoId) videoIds.add(s.videoId);
    if (s.songKey) songKeys.add(s.songKey);
  }
  const artists = new Set(state.artists.map((a) => a.key));
  return (item) => {
    const artist = shelfItemArtist(item);
    if (artist && artists.has(artist.key)) return true;
    if (item.kind === "local") {
      const { file } = item;
      if (paths.has(file.path)) return true;
      const videoId = fileVideoId(file);
      if (videoId && videoIds.has(videoId)) return true;
      const key = usableSongKey(fileSongKey(file));
      return key !== null && songKeys.has(key);
    }
    if (videoIds.has(item.track.videoId)) return true;
    const key = usableSongKey(outsideSongKey(item.track));
    return key !== null && songKeys.has(key);
  };
}

export function currentHiddenMatcher(): (item: ShelfItem) => boolean {
  return makeHiddenMatcher(useHiddenRecommendations.getState());
}

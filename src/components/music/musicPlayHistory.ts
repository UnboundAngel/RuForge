import type { MediaFile } from "@/types";
import { recordListenStatsPlay } from "./musicListenStats";
import { musicTrackIdentityKey } from "./musicShelfDedup";

export type PlayHistoryEntry = {
  path: string;
  identityKey: string;
  title: string;
  artist: string;
  playedAt: number;
  playCount: number;
};

const LS_KEY = "ruforge-music-play-history";
const MAX_ENTRIES = 50;

function primaryArtist(raw: string): string {
  return raw.split(/,|&|feat\.|ft\.|x /i)[0]?.trim() ?? raw;
}

function load(): PlayHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PlayHistoryEntry[];
  } catch {
    return [];
  }
}

function save(entries: PlayHistoryEntry[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // storage not available
  }
}

/** Record that a track started playing. Updates play count and recency. */
export function recordPlay(file: MediaFile): void {
  const key = musicTrackIdentityKey(file, primaryArtist);
  const title = file.name ?? "";
  const artist = file.artist ?? file.albumArtist ?? "";

  const entries = load();
  const existing = entries.find((e) => e.identityKey === key);

  if (existing) {
    existing.playedAt = Date.now();
    existing.playCount += 1;
    existing.title = title;
    existing.artist = artist;
    existing.path = file.path;
  } else {
    entries.unshift({
      path: file.path,
      identityKey: key,
      title,
      artist,
      playedAt: Date.now(),
      playCount: 1,
    });
  }

  // Sort newest-first and trim the ring buffer.
  entries.sort((a, b) => b.playedAt - a.playedAt);
  save(entries.slice(0, MAX_ENTRIES));
  recordListenStatsPlay(file);
}

/** Recent play history, newest first. */
export function getRecentHistory(): PlayHistoryEntry[] {
  return load().slice().sort((a, b) => b.playedAt - a.playedAt);
}

/** Most-played history, highest count first, tie-break by recency. */
export function getMostPlayedHistory(): PlayHistoryEntry[] {
  return load().slice().sort((a, b) => b.playCount - a.playCount || b.playedAt - a.playedAt);
}

/** Play count for an identity key; 0 when not in history. */
export function getPlayCount(identityKey: string): number {
  return load().find((e) => e.identityKey === identityKey)?.playCount ?? 0;
}

/** Remove all history. */
export function clearHistory(): void {
  save([]);
}

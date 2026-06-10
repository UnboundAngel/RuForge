import type { MediaFile } from "@/types";
import { getCachedListenSnapshot, setListenSnapshotForTests } from "@/lib/musicListenSnapshot";

import { recordListenStatsPlay } from "./musicListenStats";

export type PlayHistoryEntry = {
  path: string;
  identityKey: string;
  title: string;
  artist: string;
  playedAt: number;
  playCount: number;
};

function load(): PlayHistoryEntry[] {
  return getCachedListenSnapshot().history.map((h) => ({
    path: h.path,
    identityKey: h.identityKey,
    title: h.title,
    artist: h.artist,
    playedAt: h.playedAt,
    playCount: h.playCount,
  }));
}

/** @deprecated Production uses musicListenSession. Vitest-only helper. */
export function recordPlay(file: MediaFile): void {
  if (!import.meta.env.VITEST) return;
  recordListenStatsPlay(file);
  syncTestHistoryFromStats();
}

export function getRecentHistory(): PlayHistoryEntry[] {
  return load().slice().sort((a, b) => b.playedAt - a.playedAt);
}

export function getMostPlayedHistory(): PlayHistoryEntry[] {
  return load().slice().sort((a, b) => b.playCount - a.playCount || b.playedAt - a.playedAt);
}

export function getPlayCount(identityKey: string): number {
  return load().find((e) => e.identityKey === identityKey)?.playCount ?? 0;
}

export function clearHistory(): void {
  if (import.meta.env.VITEST) {
    const snap = getCachedListenSnapshot();
    setListenSnapshotForTests({ ...snap, history: [] });
  }
}

/** Vitest: mirror play into snapshot history via listen-stats test path. */
export function syncTestHistoryFromStats(): void {
  if (!import.meta.env.VITEST) return;
  const snap = getCachedListenSnapshot();
  const history = snap.stats
    .map((s) => ({
      path: s.path,
      identityKey: s.identityKey,
      title: s.title,
      artist: s.artist,
      playedAt: s.lastPlayed,
      playCount: s.playCount,
    }))
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, 50);
  setListenSnapshotForTests({ ...snap, history });
}

import type { MediaFile } from "@/types";
import { getCachedListenSnapshot, setListenSnapshotForTests } from "@/lib/musicListenSnapshot";
import { EMPTY_LISTEN_SNAPSHOT } from "@/lib/musicListenTypes";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";

export type ListenStat = {
  identityKey: string;
  path: string;
  title: string;
  artist: string;
  playCount: number;
  listenTimeSec: number;
  lastPlayed: number;
};

export type TopArtistStat = {
  artistKey: string;
  display: string;
  listenTimeSec: number;
  playCount: number;
};

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function loadAll(): ListenStat[] {
  return getCachedListenSnapshot().stats.map((s) => ({
    identityKey: s.identityKey,
    path: s.path,
    title: s.title,
    artist: s.artist,
    playCount: s.playCount,
    listenTimeSec: s.listenTimeSec,
    lastPlayed: s.lastPlayed,
  }));
}

function statFields(file: MediaFile): Pick<ListenStat, "identityKey" | "path" | "title" | "artist"> {
  const artist = file.artist ?? file.albumArtist ?? "";
  return {
    identityKey: musicTrackIdentityKey(file, primaryArtist),
    path: file.path,
    title: file.name ?? "",
    artist,
  };
}

/** Vitest-only: simulate a play start against in-memory snapshot. */
function applyTestPlay(file: MediaFile): void {
  const fields = statFields(file);
  const snap = getCachedListenSnapshot();
  const stats = [...snap.stats];
  const existing = stats.find((e) => e.identityKey === fields.identityKey);
  if (existing) {
    existing.playCount += 1;
    existing.lastPlayed = Date.now();
    existing.path = fields.path;
    existing.title = fields.title;
    existing.artist = fields.artist;
  } else {
    stats.push({
      ...fields,
      playCount: 1,
      listenTimeSec: 0,
      lastPlayed: Date.now(),
    });
  }
  setListenSnapshotForTests({ ...snap, stats });
}

/** Vitest-only: simulate listen seconds against in-memory snapshot. */
function applyTestListenTime(file: MediaFile, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const fields = statFields(file);
  const snap = getCachedListenSnapshot();
  const stats = [...snap.stats];
  let row = stats.find((e) => e.identityKey === fields.identityKey);
  if (!row) {
    row = {
      ...fields,
      playCount: 0,
      listenTimeSec: 0,
      lastPlayed: Date.now(),
    };
    stats.push(row);
  }
  row.listenTimeSec += seconds;
  row.lastPlayed = Date.now();
  setListenSnapshotForTests({ ...snap, stats });
}

/** @deprecated Production uses musicListenSession. Tests only. */
export function recordListenStatsPlay(file: MediaFile): void {
  if (!import.meta.env.VITEST) return;
  applyTestPlay(file);
}

/** @deprecated Production uses musicListenSession. Tests only. */
export function addListenTime(file: MediaFile, seconds: number): void {
  if (!import.meta.env.VITEST) return;
  applyTestListenTime(file, seconds);
}

export function getListenStat(identityKey: string): ListenStat | undefined {
  return loadAll().find((e) => e.identityKey === identityKey);
}

export function getAllListenStats(): ListenStat[] {
  return loadAll();
}

export function getTopTracks(limit: number): ListenStat[] {
  return loadAll()
    .slice()
    .sort(
      (a, b) =>
        b.listenTimeSec - a.listenTimeSec
        || b.playCount - a.playCount
        || b.lastPlayed - a.lastPlayed,
    )
    .slice(0, limit);
}

export function getTopArtists(limit: number): TopArtistStat[] {
  const byArtist = new Map<string, TopArtistStat>();
  for (const row of loadAll()) {
    const raw = row.artist.trim();
    if (!raw) continue;
    const display = primaryArtist(raw);
    const artistKey = display.toLowerCase();
    const cur = byArtist.get(artistKey);
    if (cur) {
      cur.listenTimeSec += row.listenTimeSec;
      cur.playCount += row.playCount;
    } else {
      byArtist.set(artistKey, {
        artistKey,
        display,
        listenTimeSec: row.listenTimeSec,
        playCount: row.playCount,
      });
    }
  }
  return [...byArtist.values()]
    .sort(
      (a, b) =>
        b.listenTimeSec - a.listenTimeSec
        || b.playCount - a.playCount,
    )
    .slice(0, limit);
}

export function getTotalListenTimeSec(): number {
  return loadAll().reduce((sum, row) => sum + row.listenTimeSec, 0);
}

export function getTotalPlayCount(): number {
  return loadAll().reduce((sum, row) => sum + row.playCount, 0);
}

export type ListenPeriodSummary = {
  listenTimeSec: number;
  playCount: number;
  trackCount: number;
};

export function getStatsSince(sinceMs: number): ListenPeriodSummary {
  const cutoff = Date.now() - sinceMs;
  const rows = loadAll().filter((r) => r.lastPlayed >= cutoff);
  return {
    listenTimeSec: rows.reduce((sum, row) => sum + row.listenTimeSec, 0),
    playCount: rows.reduce((sum, row) => sum + row.playCount, 0),
    trackCount: rows.length,
  };
}

export function getTopTracksSince(limit: number, sinceMs: number): ListenStat[] {
  const cutoff = Date.now() - sinceMs;
  return loadAll()
    .filter((r) => r.lastPlayed >= cutoff)
    .slice()
    .sort(
      (a, b) =>
        b.listenTimeSec - a.listenTimeSec
        || b.playCount - a.playCount
        || b.lastPlayed - a.lastPlayed,
    )
    .slice(0, limit);
}

export function getTopArtistsSince(limit: number, sinceMs: number): TopArtistStat[] {
  const cutoff = Date.now() - sinceMs;
  const byArtist = new Map<string, TopArtistStat>();
  for (const row of loadAll()) {
    if (row.lastPlayed < cutoff) continue;
    const raw = row.artist.trim();
    if (!raw) continue;
    const display = primaryArtist(raw);
    const artistKey = display.toLowerCase();
    const cur = byArtist.get(artistKey);
    if (cur) {
      cur.listenTimeSec += row.listenTimeSec;
      cur.playCount += row.playCount;
    } else {
      byArtist.set(artistKey, {
        artistKey,
        display,
        listenTimeSec: row.listenTimeSec,
        playCount: row.playCount,
      });
    }
  }
  return [...byArtist.values()]
    .sort(
      (a, b) =>
        b.listenTimeSec - a.listenTimeSec
        || b.playCount - a.playCount,
    )
    .slice(0, limit);
}

export function formatListenDuration(totalSec: number): string {
  const mins = Math.round(totalSec / 60);
  if (mins < 1) return "under 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function clearListenStats(): void {
  if (import.meta.env.VITEST) {
    setListenSnapshotForTests({ ...EMPTY_LISTEN_SNAPSHOT, history: [] });
  }
}

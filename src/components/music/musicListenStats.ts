import type { MediaFile } from "@/types";
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

const LS_KEY = "ruforge-music-listen-stats";
const MAX_STATS = 500;

function loadAll(): ListenStat[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ListenStat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(entries: ListenStat[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable
  }
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

function upsert(file: MediaFile): ListenStat[] {
  const fields = statFields(file);
  const entries = loadAll();
  const existing = entries.find((e) => e.identityKey === fields.identityKey);
  if (existing) {
    existing.playCount += 1;
    existing.lastPlayed = Date.now();
    existing.path = fields.path;
    existing.title = fields.title;
    existing.artist = fields.artist;
  } else {
    entries.push({
      ...fields,
      playCount: 1,
      listenTimeSec: 0,
      lastPlayed: Date.now(),
    });
  }
  if (entries.length <= MAX_STATS) return entries;
  entries.sort((a, b) => b.lastPlayed - a.lastPlayed);
  return entries.slice(0, MAX_STATS);
}

/** Bump play count + last played when a track starts (pairs with play-history ring). */
export function recordListenStatsPlay(file: MediaFile): void {
  saveAll(upsert(file));
}

/** Add wall-clock listen seconds for the current track (batched from playback). */
export function addListenTime(file: MediaFile, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const fields = statFields(file);
  const entries = loadAll();
  let row = entries.find((e) => e.identityKey === fields.identityKey);
  if (!row) {
    row = {
      ...fields,
      playCount: 0,
      listenTimeSec: 0,
      lastPlayed: Date.now(),
    };
    entries.push(row);
  }
  row.listenTimeSec += seconds;
  row.lastPlayed = Date.now();
  row.path = fields.path;
  row.title = fields.title;
  row.artist = fields.artist;
  if (entries.length > MAX_STATS) {
    entries.sort((a, b) => b.lastPlayed - a.lastPlayed);
    saveAll(entries.slice(0, MAX_STATS));
    return;
  }
  saveAll(entries);
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

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function clearListenStats(): void {
  saveAll([]);
}

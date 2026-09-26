import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import type { MediaFile } from "@/types";
import { extractYouTubeVideoId } from "@/youtubeUrl";
import { artistKeyFromFile, primaryArtist } from "./musicArtist";

/** A YouTube Music song suggested under a playlist that is not in the library yet. */
export type OutsideTrack = {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  duration: number | null;
  /** Watch URL handed to the downloader. */
  url: string;
};

/** Video id of a downloaded song, from its sidecar id or its source URL. */
export function fileVideoId(file: MediaFile): string | null {
  const id = file.sourceId?.trim();
  if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
  return file.sourceUrl ? extractYouTubeVideoId(file.sourceUrl) : null;
}

/** YouTube Music's radio for one song: what YTM plays after it. */
export function musicRadioUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}&list=RDAMVM${videoId}`;
}

/**
 * Songs in the playlist that can seed a radio, most represented artist first.
 * Ties keep playlist order so the same playlist always yields the same seeds.
 */
export function radioSeeds(playlistTracks: MediaFile[], max = 5): string[] {
  const weight = new Map<string, number>();
  for (const t of playlistTracks) {
    const key = artistKeyFromFile(t);
    weight.set(key, (weight.get(key) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const seeds: { id: string; w: number; i: number }[] = [];
  playlistTracks.forEach((t, i) => {
    const id = fileVideoId(t);
    if (!id || seen.has(id)) return;
    seen.add(id);
    seeds.push({ id, w: weight.get(artistKeyFromFile(t)) ?? 0, i });
  });
  seeds.sort((a, b) => b.w - a.w || a.i - b.i);
  // One seed per artist first, so Refresh moves to a different artist's radio.
  const byArtist: string[] = [];
  const rest: string[] = [];
  const artists = new Set<string>();
  for (const s of seeds) {
    const key = artistKeyFromFile(playlistTracks[s.i]);
    if (key && artists.has(key)) rest.push(s.id);
    else {
      artists.add(key);
      byArtist.push(s.id);
    }
  }
  return [...byArtist, ...rest].slice(0, max);
}

/** "Artist - Topic" channels are YTM's auto-generated artist uploads. */
function cleanArtist(raw: string | null): string {
  const s = (raw ?? "").replace(/\s*-\s*Topic$/i, "").trim();
  return s ? primaryArtist(s) || s : "";
}

/** Lowercase title without bracketed noise, so "Song (Official Video)" and "Song" dedupe. */
function songKey(title: string, artist: string): string {
  const t = title
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `${artist.toLowerCase()}|${t}`;
}

/**
 * Radio results the user doesn't already have: drops the seed, songs in the library
 * (by video id or by title and artist), and repeats such as a video and its audio version.
 */
export function mergeOutsideRecommendations(
  radio: MusicTrackInfo[],
  library: MediaFile[],
  seedId: string,
): OutsideTrack[] {
  const ownedIds = new Set<string>();
  const ownedKeys = new Set<string>();
  for (const f of library) {
    const id = fileVideoId(f);
    if (id) ownedIds.add(id);
    const artist = cleanArtist(f.artist ?? f.albumArtist ?? null);
    ownedKeys.add(songKey(f.canonicalTitle ?? f.name, artist));
  }
  const out: OutsideTrack[] = [];
  const seenIds = new Set<string>([seedId]);
  const seenKeys = new Set<string>();
  for (const item of radio) {
    const videoId = extractYouTubeVideoId(item.url) ?? extractYouTubeVideoId(item.id);
    if (!videoId || seenIds.has(videoId) || ownedIds.has(videoId)) continue;
    const title = item.title.trim();
    if (!title) continue;
    const artist = cleanArtist(item.artist);
    const key = songKey(title, artist);
    if (ownedKeys.has(key) || seenKeys.has(key)) continue;
    seenIds.add(videoId);
    seenKeys.add(key);
    out.push({
      videoId,
      title,
      artist,
      thumbnail: item.thumbnail,
      duration: item.duration,
      url: `https://music.youtube.com/watch?v=${videoId}`,
    });
  }
  return out;
}

/**
 * Which seed and which slice of its radio a Refresh round shows. Rounds walk the seeds
 * first, then come back for the next page of each radio.
 */
export function outsideRoundSlot(round: number, seedCount: number): { seedIndex: number; page: number } {
  if (seedCount <= 0) return { seedIndex: 0, page: 0 };
  return { seedIndex: round % seedCount, page: Math.floor(round / seedCount) };
}

/** One page of a radio pool, wrapping when the pool runs out. */
export function outsidePage<T>(pool: T[], page: number, count: number): T[] {
  if (pool.length <= count) return pool;
  const start = (page * count) % pool.length;
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

// ---------------------------------------------------------------------------
// Radio cache and backoff (localStorage, best effort)
// ---------------------------------------------------------------------------

const CACHE_KEY = "ruforge-music-radio-cache";
const BACKOFF_KEY = "ruforge-music-radio-backoff-until";
export const RADIO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** After a failed fetch, leave YouTube alone for a while so Explore keeps its rate budget. */
export const RADIO_BACKOFF_MS = 30 * 60 * 1000;
const CACHE_MAX_SEEDS = 40;

type RadioCache = Record<string, { at: number; items: MusicTrackInfo[] }>;

function readCache(): RadioCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as RadioCache) : {};
  } catch {
    return {};
  }
}

export function readCachedRadio(seedId: string, now = Date.now()): MusicTrackInfo[] | null {
  const hit = readCache()[seedId];
  if (!hit || !Array.isArray(hit.items) || now - hit.at > RADIO_CACHE_TTL_MS) return null;
  return hit.items;
}

export function writeCachedRadio(seedId: string, items: MusicTrackInfo[], now = Date.now()): void {
  const cache = readCache();
  cache[seedId] = { at: now, items };
  // Keep the newest seeds only; each entry holds a few KB.
  const keep = Object.entries(cache)
    .filter(([, v]) => now - v.at <= RADIO_CACHE_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, CACHE_MAX_SEEDS);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* storage full or blocked: the radio just refetches next time */
  }
}

export function radioBackoffActive(now = Date.now()): boolean {
  try {
    return Number(localStorage.getItem(BACKOFF_KEY) ?? 0) > now;
  } catch {
    return false;
  }
}

export function startRadioBackoff(now = Date.now()): void {
  try {
    localStorage.setItem(BACKOFF_KEY, String(now + RADIO_BACKOFF_MS));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Pending adds: songs downloading on their way into a playlist
// ---------------------------------------------------------------------------

const PENDING_KEY = "ruforge-music-pending-playlist-adds";
/** Give up on a download that never lands (failed, cancelled, or deleted). */
export const PENDING_ADD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingPlaylistAdd = { videoId: string; playlistId: string; at: number };

export function readPendingAdds(): PendingPlaylistAdd[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is PendingPlaylistAdd =>
            !!p && typeof p.videoId === "string" && typeof p.playlistId === "string" && typeof p.at === "number",
        )
      : [];
  } catch {
    return [];
  }
}

export function writePendingAdds(list: PendingPlaylistAdd[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Splits pending adds into songs that have arrived in the library (with their file path)
 * and ones still waiting. Expired entries are dropped.
 */
export function resolvePendingAdds(
  pending: PendingPlaylistAdd[],
  library: MediaFile[],
  now = Date.now(),
): { ready: { add: PendingPlaylistAdd; path: string }[]; waiting: PendingPlaylistAdd[] } {
  const pathById = new Map<string, string>();
  for (const f of library) {
    const id = fileVideoId(f);
    if (id && !pathById.has(id)) pathById.set(id, f.path);
  }
  const ready: { add: PendingPlaylistAdd; path: string }[] = [];
  const waiting: PendingPlaylistAdd[] = [];
  for (const p of pending) {
    const path = pathById.get(p.videoId);
    if (path) ready.push({ add: p, path });
    else if (now - p.at <= PENDING_ADD_TTL_MS) waiting.push(p);
  }
  return { ready, waiting };
}

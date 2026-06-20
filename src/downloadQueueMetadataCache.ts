import type { DownloadJobMediaSnapshot } from "./downloadQueue";
import { normalizeYouTubeUrlForCompare, youtubeUrlsMatch } from "./youtubeUrl";

const LS_KEY = "ruforge-dl-jobmeta-v1";
const MAX_ENTRIES = 36;
const MAX_PLAYLIST_ITEMS_IN_CACHE = 40;

type CacheRow = { v: 1; snap: DownloadJobMediaSnapshot; at: number };

function readRaw(): Record<string, CacheRow> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, CacheRow>;
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function writeRaw(data: Record<string, CacheRow>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

function trimSnapshotForStorage(s: DownloadJobMediaSnapshot): DownloadJobMediaSnapshot {
  const items = s.playlistItems;
  if (!items?.length || items.length <= MAX_PLAYLIST_ITEMS_IN_CACHE) return s;
  return { ...s, playlistItems: items.slice(0, MAX_PLAYLIST_ITEMS_IN_CACHE) };
}

function pruneLru(data: Record<string, CacheRow>): Record<string, CacheRow> {
  const keys = Object.keys(data);
  if (keys.length <= MAX_ENTRIES) return data;
  const scored = keys.map((k) => ({ k, at: data[k]?.at ?? 0 }));
  scored.sort((a, b) => a.at - b.at);
  const drop = scored.length - MAX_ENTRIES;
  const next = { ...data };
  for (let i = 0; i < drop; i++) delete next[scored[i]!.k];
  return next;
}

/** Normalized URL without format suffix (for eviction across cache variants). */
export function downloadJobMetadataUrlBase(url: string): string {
  return normalizeYouTubeUrlForCompare(url.trim());
}

/** Cache key: normalized URL + video quality `-f` (row stores both audio and video byte estimates). */
export function downloadJobMetadataCacheKey(url: string, videoFormat: string): string {
  const base = downloadJobMetadataUrlBase(url);
  if (!base) return "";
  return `${base}\x1f${videoFormat}`;
}

/** @deprecated Legacy rows used `url|a` / `url|v` under the URL-only base key. */
export function downloadJobMetadataCacheKeyLegacy(
  url: string,
  audioOnly: boolean,
): string {
  const base = downloadJobMetadataUrlBase(url);
  if (!base) return "";
  return `${base}\x1e${audioOnly ? "a" : "v"}`;
}

function deleteAllCacheRowsForUrl(data: Record<string, CacheRow>, url: string): boolean {
  const base = downloadJobMetadataUrlBase(url);
  if (!base) return false;
  let changed = false;
  for (const key of Object.keys(data)) {
    if (
      key === base ||
      key.startsWith(`${base}\x1f`) ||
      key.startsWith(`${base}\x1e`)
    ) {
      delete data[key];
      changed = true;
    }
  }
  return changed;
}

function readCachedRow(
  url: string,
  videoFormat: string,
): DownloadJobMediaSnapshot | null {
  const key = downloadJobMetadataCacheKey(url, videoFormat);
  if (!key) return null;
  const data = readRaw();
  const row = data[key];
  if (row?.v === 1 && row.snap) return row.snap;

  const base = downloadJobMetadataUrlBase(url);
  const legacyA = data[`${base}\x1ea`];
  const legacyV = data[`${base}\x1ev`];
  if (!legacyA?.snap && !legacyV?.snap) return null;
  const snap: DownloadJobMediaSnapshot = {
    title: legacyA?.snap?.title ?? legacyV?.snap?.title ?? "",
    thumbnail: legacyA?.snap?.thumbnail ?? legacyV?.snap?.thumbnail ?? "",
    duration: legacyA?.snap?.duration ?? legacyV?.snap?.duration ?? 0,
    isPlaylist: Boolean(legacyA?.snap?.isPlaylist ?? legacyV?.snap?.isPlaylist),
    playlistItems: legacyA?.snap?.playlistItems ?? legacyV?.snap?.playlistItems,
    uploader: legacyA?.snap?.uploader ?? legacyV?.snap?.uploader,
    channel: legacyA?.snap?.channel ?? legacyV?.snap?.channel,
    fileSizeBytesAudio:
      legacyA?.snap?.fileSizeBytesAudio ?? legacyA?.snap?.fileSizeBytes ?? null,
    fileSizeBytesVideo:
      legacyV?.snap?.fileSizeBytesVideo ?? legacyV?.snap?.fileSizeBytes ?? null,
    fileSizeBytes: null,
  };
  return snap;
}

/** Synchronous read for hydrate — no I/O beyond localStorage. */
export function peekDownloadJobMetadataCache(
  url: string,
  videoFormat: string,
): DownloadJobMediaSnapshot | null {
  const snap = readCachedRow(url, videoFormat);
  if (!snap) return null;
  const t = String(snap.title ?? "").trim();
  const th = String(snap.thumbnail ?? "").trim();
  if (!t || !th) return null;
  const hasAudio =
    typeof snap.fileSizeBytesAudio === "number" && snap.fileSizeBytesAudio > 0;
  const hasVideo =
    typeof snap.fileSizeBytesVideo === "number" && snap.fileSizeBytesVideo > 0;
  if (!hasAudio && !hasVideo) {
    const legacy =
      typeof snap.fileSizeBytes === "number" && snap.fileSizeBytes > 0;
    if (!legacy) return null;
  }
  return snap;
}

/** Hero display lane only: title + thumb, no size requirement (queue display-only hydrate rows). */
export function peekDownloadJobMetadataCacheForHeroDisplay(
  url: string,
  videoFormat: string,
): DownloadJobMediaSnapshot | null {
  const snap = readCachedRow(url, videoFormat);
  if (!snap) return null;
  const t = String(snap.title ?? "").trim();
  const th = String(snap.thumbnail ?? "").trim();
  if (!t || !th) return null;
  return snap;
}

export function commitDownloadJobMetadataCache(
  compareKey: string,
  snapshot: DownloadJobMediaSnapshot,
): void {
  if (!compareKey) return;
  const snap = trimSnapshotForStorage(snapshot);
  const data = readRaw();
  data[compareKey] = { v: 1, snap, at: Date.now() };
  writeRaw(pruneLru(data));
}

/** After a job row is removed: drop cache row if no remaining job still references that URL. */
export function evictDownloadJobMetadataCacheIfOrphaned(
  removedJobUrl: string,
  remainingJobs: readonly { url: string }[],
  keepForHeroUrl?: string | null,
): boolean {
  const base = downloadJobMetadataUrlBase(removedJobUrl);
  if (!base) return false;
  if (keepForHeroUrl?.trim() && youtubeUrlsMatch(keepForHeroUrl, removedJobUrl)) {
    return false;
  }
  const stillUsed = remainingJobs.some(
    (j) => downloadJobMetadataUrlBase(j.url) === base,
  );
  if (stillUsed) return false;
  const data = readRaw();
  if (deleteAllCacheRowsForUrl(data, removedJobUrl)) {
    writeRaw(data);
    return true;
  }
  return false;
}

/** Drop dual-size cache when no queued/paused/downloading job still needs the URL. */
export function evictDownloadJobMetadataCacheWhenIdle(
  url: string,
  jobs: readonly { url: string; status: string }[],
  keepForHeroUrl?: string | null,
): boolean {
  const base = downloadJobMetadataUrlBase(url);
  if (!base) return false;
  if (keepForHeroUrl?.trim() && youtubeUrlsMatch(keepForHeroUrl, url)) {
    return false;
  }
  const active = jobs.some(
    (j) =>
      downloadJobMetadataUrlBase(j.url) === base &&
      (j.status === "queued" ||
        j.status === "paused" ||
        j.status === "downloading"),
  );
  if (active) return false;
  const data = readRaw();
  if (deleteAllCacheRowsForUrl(data, url)) {
    writeRaw(data);
    return true;
  }
  return false;
}

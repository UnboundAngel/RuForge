import type { DownloadJobMediaSnapshot } from "./downloadQueue";
import { normalizeYouTubeUrlForCompare } from "./youtubeUrl";

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

/** Synchronous read for hydrate — no I/O beyond localStorage. */
export function peekDownloadJobMetadataCache(url: string): DownloadJobMediaSnapshot | null {
  const key = normalizeYouTubeUrlForCompare(url.trim());
  if (!key) return null;
  const row = readRaw()[key];
  if (!row || row.v !== 1 || !row.snap) return null;
  const t = String(row.snap.title ?? "").trim();
  const th = String(row.snap.thumbnail ?? "").trim();
  const size = row.snap.fileSizeBytes;
  if (!t || !th) return null;
  if (typeof size !== "number" || size <= 0) return null;
  return row.snap;
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
): void {
  const key = normalizeYouTubeUrlForCompare(removedJobUrl.trim());
  if (!key) return;
  const stillUsed = remainingJobs.some(
    (j) => normalizeYouTubeUrlForCompare(j.url.trim()) === key,
  );
  if (stillUsed) return;
  const data = readRaw();
  if (!(key in data)) return;
  delete data[key];
  writeRaw(data);
}

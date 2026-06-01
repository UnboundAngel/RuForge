import type { MediaFile } from "@/types";
import { stripYtdlpStreamSuffix } from "@/galleryDedupe";
import { extractYouTubeVideoId } from "@/youtubeUrl";

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fileStem(file: MediaFile): string {
  const path = file.path.replace(/\\/g, "/");
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;
  return stripYtdlpStreamSuffix(stem);
}

/** Collapse "(Deluxe)" / "(Remastered)" album variants in shelf grouping. */
export function normalizeAlbumShelfKey(album: string): string {
  let s = album.trim();
  while (/\s*\([^)]*\)\s*$/.test(s)) {
    s = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  return normalizeToken(s);
}

/**
 * Stable identity for shelf dedup: YouTube id when known, else canonical/tag artist + canonical/display title.
 */
export function musicTrackIdentityKey(
  file: MediaFile,
  primaryArtist: (raw: string) => string,
): string {
  const id = file.sourceId?.trim();
  if (id) return `id:${id}`;
  const url = file.sourceUrl?.trim();
  if (url) {
    const vid = extractYouTubeVideoId(url);
    if (vid) return `id:${vid}`;
    return `url:${url.toLowerCase()}`;
  }
  const stem = fileStem(file);
  const titleRaw = file.canonicalTitle?.trim()
    || (file.name?.trim() && file.name.trim() !== stem ? file.name : stem);
  const title = normalizeToken(titleRaw);
  const artistRaw = file.canonicalArtist?.trim() || file.artist || file.albumArtist || "";
  const artist = artistRaw ? primaryArtist(artistRaw).toLowerCase() : "";
  return `song:${artist}|${title}`;
}

/** Keep the first occurrence of each logical track (preserves input order). */
export function dedupeMusicTracks(
  tracks: MediaFile[],
  primaryArtist: (raw: string) => string,
): MediaFile[] {
  const seen = new Set<string>();
  const out: MediaFile[] = [];
  for (const t of tracks) {
    const key = musicTrackIdentityKey(t, primaryArtist);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function artistShelfKey(file: MediaFile, primaryArtist: (raw: string) => string): string {
  const raw = file.canonicalArtist?.trim() || file.artist || file.albumArtist || "";
  return raw ? primaryArtist(raw).toLowerCase() : "_unknown";
}

/** Album dedup key for shelf grouping. Prefers canonical album from sidecar. */
export function albumKeyFromFile(file: MediaFile): string {
  return normalizeAlbumShelfKey(file.canonicalAlbum ?? file.album ?? "");
}

/**
 * Limit how many cards from one artist appear in a shelf; fills remaining slots
 * without the cap when the library is too small to hit the limit.
 */
export function diversifyTracksByArtist(
  tracks: MediaFile[],
  maxPerArtist: number,
  limit: number,
  primaryArtist: (raw: string) => string,
): MediaFile[] {
  const counts = new Map<string, number>();
  const out: MediaFile[] = [];
  const usedPaths = new Set<string>();

  for (const t of tracks) {
    if (out.length >= limit) break;
    const key = artistShelfKey(t, primaryArtist);
    const n = counts.get(key) ?? 0;
    if (n >= maxPerArtist) continue;
    counts.set(key, n + 1);
    out.push(t);
    usedPaths.add(t.path);
  }

  if (out.length < limit) {
    for (const t of tracks) {
      if (out.length >= limit) break;
      if (usedPaths.has(t.path)) continue;
      out.push(t);
      usedPaths.add(t.path);
    }
  }

  return out;
}

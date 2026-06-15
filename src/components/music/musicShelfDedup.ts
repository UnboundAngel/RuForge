import type { MediaFile } from "@/types";
import { stripYtdlpStreamSuffix } from "@/galleryDedupe";
import { extractYouTubeVideoId } from "@/youtubeUrl";
import { artistKeyFromFile } from "./musicArtist";

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

export function rawAlbumNameFromFile(file: MediaFile): string {
  return (file.canonicalAlbum ?? file.album)?.trim() ?? "";
}

export type AlbumGroup = {
  albumKey: string;
  artistKey: string;
  album: string;
  artist: string;
  tracks: MediaFile[];
};

/** Group tracks by artist + album; omit single-track pseudo-albums (standalone songs). */
export function buildMultiTrackAlbumGroups(
  tracks: MediaFile[],
  primaryArtist: (raw: string) => string,
): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const t of tracks) {
    const albumName = rawAlbumNameFromFile(t);
    if (!albumName) continue;
    const artistKey = artistKeyFromFile(t);
    if (!artistKey) continue;
    const albumKey = normalizeAlbumShelfKey(albumName);
    const key = `${artistKey}::${albumKey}`;
    if (!map.has(key)) {
      const raw = t.canonicalArtist?.trim() || t.albumArtist || t.artist || "";
      map.set(key, {
        albumKey,
        artistKey,
        album: albumName,
        artist: raw ? primaryArtist(raw) : artistKey,
        tracks: [],
      });
    }
    map.get(key)!.tracks.push(t);
  }
  return [...map.values()].filter((g) => g.tracks.length >= 2);
}

export function fileHasBrowsableAlbum(
  file: MediaFile,
  tracks: MediaFile[],
): boolean {
  const albumName = rawAlbumNameFromFile(file);
  if (!albumName) return false;
  const artistKey = artistKeyFromFile(file);
  if (!artistKey) return false;
  const albumKey = normalizeAlbumShelfKey(albumName);
  let count = 0;
  for (const t of tracks) {
    if (artistKeyFromFile(t) !== artistKey) continue;
    const a = rawAlbumNameFromFile(t);
    if (!a || normalizeAlbumShelfKey(a) !== albumKey) continue;
    count += 1;
    if (count >= 2) return true;
  }
  return false;
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

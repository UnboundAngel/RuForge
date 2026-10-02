import type { GalleryEntry, MediaFile, PlaylistItem } from "./types";
import {
  extractYouTubePlaylistId,
  extractYouTubeVideoId,
  normalizeYouTubeUrlForCompare,
  playlistItemWatchUrl,
} from "./youtubeUrl";

export type DuplicateMatch = {
  file: MediaFile;
  matchedVia: "video_id" | "url" | "source_id" | "title";
};

type LibraryIndex = {
  byVideoId: Map<string, DuplicateMatch>;
  byPlaylistId: Map<string, MediaFile>;
  byUrl: Map<string, MediaFile>;
  byTitle: Map<string, MediaFile>;
};

function iterMediaFiles(entries: GalleryEntry[]): MediaFile[] {
  const out: MediaFile[] = [];
  for (const entry of entries) {
    if (entry.kind === "media") {
      out.push(entry);
    } else {
      for (const item of entry.items) out.push(item);
    }
  }
  return out;
}

// Playlist pickers check hundreds of rows per render; scanning the library per row froze the UI.
const indexCache = new WeakMap<GalleryEntry[], LibraryIndex>();

function libraryIndex(entries: GalleryEntry[]): LibraryIndex {
  const cached = indexCache.get(entries);
  if (cached) return cached;

  const index: LibraryIndex = {
    byVideoId: new Map(),
    byPlaylistId: new Map(),
    byUrl: new Map(),
    byTitle: new Map(),
  };
  const setFirst = <V>(map: Map<string, V>, key: string, value: V) => {
    if (key && !map.has(key)) map.set(key, value);
  };

  for (const file of iterMediaFiles(entries)) {
    const storedId = file.sourceId?.trim();
    if (storedId) setFirst(index.byVideoId, storedId, { file, matchedVia: "source_id" });

    const source = file.sourceUrl?.trim();
    if (source) {
      const urlId = extractYouTubeVideoId(source);
      if (urlId) setFirst(index.byVideoId, urlId, { file, matchedVia: "video_id" });
      const listId = extractYouTubePlaylistId(source);
      if (listId) setFirst(index.byPlaylistId, listId, file);
      setFirst(index.byUrl, normalizeYouTubeUrlForCompare(source), file);
    }

    setFirst(index.byTitle, normalizeTitleForLibraryMatch(file.name ?? ""), file);
    const stem = file.path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? "";
    setFirst(index.byTitle, normalizeTitleForLibraryMatch(stem), file);
  }

  indexCache.set(entries, index);
  return index;
}

/** First library item matching the download URL (`sourceUrl` or sidecar `sourceId`). */
export function findLibraryDuplicate(
  targetUrl: string,
  entries: GalleryEntry[],
): DuplicateMatch | null {
  const index = libraryIndex(entries);

  const targetId = extractYouTubeVideoId(targetUrl);
  if (targetId) {
    const byId = index.byVideoId.get(targetId);
    if (byId) return byId;
  }

  const listId = extractYouTubePlaylistId(targetUrl);
  if (listId) {
    const byList = index.byPlaylistId.get(listId);
    if (byList) return { file: byList, matchedVia: "url" };
  }

  const byUrl = index.byUrl.get(normalizeYouTubeUrlForCompare(targetUrl));
  return byUrl ? { file: byUrl, matchedVia: "url" } : null;
}

function normalizeTitleForLibraryMatch(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a playlist preview row to a library file (URL, id, then title). */
export function findLibraryMatchForPlaylistItem(
  item: PlaylistItem,
  entries: GalleryEntry[],
): DuplicateMatch | null {
  const watch = playlistItemWatchUrl(item);
  if (watch) {
    const byUrl = findLibraryDuplicate(watch, entries);
    if (byUrl) return byUrl;
  }

  const index = libraryIndex(entries);
  const itemId = item.id?.trim();
  if (itemId) {
    const byId = index.byVideoId.get(itemId);
    if (byId) return byId;
  }

  const wantTitle = normalizeTitleForLibraryMatch(item.title ?? "");
  if (!wantTitle) return null;
  const byTitle = index.byTitle.get(wantTitle);
  return byTitle ? { file: byTitle, matchedVia: "title" } : null;
}

/** True when the media file lives directly under `outputDir` (not already in a playlist folder). */
export function isFlatMediaAtGalleryRoot(file: MediaFile, outputDir: string): boolean {
  const normRoot = outputDir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const normPath = file.path.replace(/\\/g, "/").toLowerCase();
  if (!normPath.startsWith(`${normRoot}/`)) return false;
  const rest = normPath.slice(normRoot.length + 1);
  return !rest.includes("/");
}

export const DEFAULT_FILENAME_TEMPLATE = "%(title)s.%(ext)s";

/** yt-dlp template that avoids overwriting an existing file with the same title. */
export const SAVE_AS_NEW_FILENAME_TEMPLATE = "%(title)s [%(id)s].%(ext)s";

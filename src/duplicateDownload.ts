import type { GalleryEntry, MediaFile, PlaylistItem } from "./types";
import { extractYouTubeVideoId, playlistItemWatchUrl, youtubeUrlsMatch } from "./youtubeUrl";

export type DuplicateMatch = {
  file: MediaFile;
  matchedVia: "video_id" | "url" | "source_id" | "title";
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

/** First library item matching the download URL (`sourceUrl` or sidecar `sourceId`). */
export function findLibraryDuplicate(
  targetUrl: string,
  entries: GalleryEntry[],
): DuplicateMatch | null {
  const targetId = extractYouTubeVideoId(targetUrl);

  for (const file of iterMediaFiles(entries)) {
    const source = file.sourceUrl?.trim();
    const storedId = file.sourceId?.trim();

    if (targetId) {
      if (storedId && storedId === targetId) {
        return { file, matchedVia: "source_id" };
      }
      if (source) {
        const sourceIdFromUrl = extractYouTubeVideoId(source);
        if (sourceIdFromUrl && sourceIdFromUrl === targetId) {
          return { file, matchedVia: "video_id" };
        }
      }
    }

    if (source) {
      if (youtubeUrlsMatch(targetUrl, source)) {
        return { file, matchedVia: "url" };
      }
    }
  }

  return null;
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

  const itemId = item.id?.trim();
  if (itemId) {
    for (const file of iterMediaFiles(entries)) {
      const storedId = file.sourceId?.trim();
      if (storedId && storedId === itemId) {
        return { file, matchedVia: "source_id" };
      }
      const fromUrl = file.sourceUrl?.trim();
      if (fromUrl) {
        const vid = extractYouTubeVideoId(fromUrl);
        if (vid && vid === itemId) {
          return { file, matchedVia: "video_id" };
        }
      }
    }
  }

  const wantTitle = normalizeTitleForLibraryMatch(item.title ?? "");
  if (!wantTitle) return null;

  for (const file of iterMediaFiles(entries)) {
    const candidates = [
      file.name,
      file.path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? "",
    ];
    for (const c of candidates) {
      if (normalizeTitleForLibraryMatch(c) === wantTitle) {
        return { file, matchedVia: "title" };
      }
    }
  }

  return null;
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

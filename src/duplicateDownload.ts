import type { GalleryEntry, MediaFile } from "./types";
import { extractYouTubeVideoId, youtubeUrlsMatch } from "./youtubeUrl";

export type DuplicateMatch = {
  file: MediaFile;
  matchedVia: "video_id" | "url" | "source_id";
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

    if (source) {
      if (targetId) {
        const sourceIdFromUrl = extractYouTubeVideoId(source);
        if (sourceIdFromUrl && sourceIdFromUrl === targetId) {
          return { file, matchedVia: "video_id" };
        }
      }

      if (youtubeUrlsMatch(targetUrl, source)) {
        return { file, matchedVia: "url" };
      }
      continue;
    }

    if (!targetId) continue;

    const storedId = file.sourceId?.trim();
    if (storedId && storedId === targetId) {
      return { file, matchedVia: "source_id" };
    }
  }

  return null;
}

export const DEFAULT_FILENAME_TEMPLATE = "%(title)s.%(ext)s";

/** yt-dlp template that avoids overwriting an existing file with the same title. */
export const SAVE_AS_NEW_FILENAME_TEMPLATE = "%(title)s [%(id)s].%(ext)s";

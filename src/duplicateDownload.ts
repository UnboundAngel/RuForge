import type { GalleryEntry, MediaFile } from "./types";
import { extractYouTubeVideoId, youtubeUrlsMatch } from "./youtubeUrl";

export type DuplicateMatch = {
  file: MediaFile;
  matchedVia: "video_id" | "url";
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

/** First library item whose `sourceUrl` matches the download URL (by video id or normalized URL). */
export function findLibraryDuplicate(
  targetUrl: string,
  entries: GalleryEntry[],
): DuplicateMatch | null {
  const targetId = extractYouTubeVideoId(targetUrl);

  for (const file of iterMediaFiles(entries)) {
    const source = file.sourceUrl?.trim();
    if (!source) continue;

    if (targetId) {
      const sourceId = extractYouTubeVideoId(source);
      if (sourceId && sourceId === targetId) {
        return { file, matchedVia: "video_id" };
      }
    }

    if (youtubeUrlsMatch(targetUrl, source)) {
      return { file, matchedVia: "url" };
    }
  }

  return null;
}

export const DEFAULT_FILENAME_TEMPLATE = "%(title)s.%(ext)s";

/** yt-dlp template that avoids overwriting an existing file with the same title. */
export const SAVE_AS_NEW_FILENAME_TEMPLATE = "%(title)s [%(id)s].%(ext)s";

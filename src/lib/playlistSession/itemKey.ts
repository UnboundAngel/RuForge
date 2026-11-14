import type { MediaFile } from "../../types";
import { extractYouTubeVideoId } from "../../youtubeUrl";

/**
 * Identity of a video playlist item that survives a move: the YouTube id when known, else the
 * source url, else the path. Stored as `identityKey` on playlist items and in play sessions.
 */
export function videoItemKey(file: MediaFile): string {
  const id = file.sourceId?.trim();
  if (id) return `id:${id}`;
  const url = file.sourceUrl?.trim();
  if (url) {
    const vid = extractYouTubeVideoId(url);
    return vid ? `id:${vid}` : `url:${url.toLowerCase()}`;
  }
  return `path:${file.path.replace(/\//g, "\\").toLowerCase()}`;
}

/** Path keys cannot follow a moved file, so only id and url keys count for relocation. */
export function videoKeyCanRelocate(key: string): boolean {
  return !key.startsWith("path:");
}

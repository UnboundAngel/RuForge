import type { MediaFile } from "@/types";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { videoItemKey } from "@/lib/playlistSession/itemKey";

/**
 * Library videos worth adding to a playlist: not already in it, favouring the channels it already
 * holds and unwatched videos, newest download first among equals.
 */
export function suggestVideos(
  inPlaylist: readonly MediaFile[],
  library: readonly MediaFile[],
  isWatched: (file: MediaFile) => boolean,
  limit = 8,
): MediaFile[] {
  const heldKeys = new Set(inPlaylist.map(videoItemKey));
  const channels = new Map<string, number>();
  for (const f of inPlaylist) {
    const id = f.youtube?.channelId;
    if (id) channels.set(id, (channels.get(id) ?? 0) + 1);
  }
  const scored: Array<{ file: MediaFile; score: number }> = [];
  for (const file of library) {
    if (heldKeys.has(videoItemKey(file))) continue;
    if (inPlaylist.some((f) => mediaPathsMatch(f.path, file.path))) continue;
    let score = 0;
    const id = file.youtube?.channelId;
    if (id && channels.has(id)) score += 4 + Math.min(channels.get(id) ?? 0, 3);
    if (!isWatched(file)) score += 2;
    scored.push({ file, score });
  }
  scored.sort((a, b) => b.score - a.score || b.file.created - a.file.created);
  return scored.slice(0, limit).map((s) => s.file);
}

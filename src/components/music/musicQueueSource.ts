import type { MediaFile } from "@/types";

/**
 * Folder/album context for the queue list section label.
 * Returns null for library fallback (use "Next up" label).
 */
export function resolveQueueSourceLabel(
  playingFile: MediaFile | null,
  folderAudioPlaylist: MediaFile[],
): string | null {
  if (!playingFile) return null;
  const inFolder = folderAudioPlaylist.some((f) => f.path === playingFile.path);
  if (!inFolder || folderAudioPlaylist.length === 0) return null;

  const album = playingFile.album?.trim();
  if (album) return album;

  const artist = playingFile.artist?.trim();
  if (artist) return artist;

  const first = folderAudioPlaylist[0]!;
  const parts = first.path.replace(/\\/g, "/").split("/");
  const parentDir = parts[parts.length - 2]?.trim() ?? "";
  if (parentDir) return parentDir;

  return null;
}

export function queueNextSectionLabel(source: string | null): string {
  return source ? `Next from: ${source}` : "Next up";
}

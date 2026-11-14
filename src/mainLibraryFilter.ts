import { isAudioOnlyPath } from "./mediaKind";
import {
  getVirtualRecord,
  isMusicPlaylistRecord,
  parseVirtualPlaylistId,
} from "./virtualPlaylists";
import type { GalleryEntry, MediaFile } from "./types";

/** Flatten a gallery row into its media files (single item or playlist items). */
export function galleryEntryItems(entry: GalleryEntry): MediaFile[] {
  return entry.kind === "media" ? [entry] : entry.items;
}

/** True when every file in the entry is an audio-only format (song / music playlist). */
export function isAudioGalleryEntry(entry: GalleryEntry): boolean {
  const items = galleryEntryItems(entry);
  if (items.length === 0) return false;
  return items.every((f) => isAudioOnlyPath(f.path));
}

/** An empty playlist has no files to judge, so its kind decides. */
function isEmptyMusicPlaylist(entry: GalleryEntry): boolean {
  if (entry.kind !== "playlist" || entry.items.length > 0) return false;
  const id = parseVirtualPlaylistId(entry.path);
  const record = id ? getVirtualRecord(id) : undefined;
  return !!record && isMusicPlaylistRecord(record);
}

/**
 * Filter gallery rows for the main Video Library.
 * When `hideAudio` is true, audio files and all-audio playlists are excluded
 * so songs live in Music mode only.
 */
export function filterMainLibraryEntries(
  entries: GalleryEntry[],
  hideAudio: boolean,
): GalleryEntry[] {
  if (!hideAudio) return entries;
  return entries.filter((entry) => !isAudioGalleryEntry(entry) && !isEmptyMusicPlaylist(entry));
}

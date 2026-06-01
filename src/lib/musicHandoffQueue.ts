import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { isAudioOnlyPath } from "@/mediaKind";
import type { GalleryEntry, MediaFile } from "@/types";

/** Same effective playlist resolution as `useMusicPlayback`. */
export function buildMusicEffectivePlaylist(
  playingFile: MediaFile,
  folderAudioPlaylist: MediaFile[],
  entries: GalleryEntry[],
): MediaFile[] {
  if (folderAudioPlaylist.some((f) => f.path === playingFile.path)) {
    return folderAudioPlaylist;
  }
  const libraryAudio = flattenGalleryScanToMediaFiles(entries).filter((f) =>
    isAudioOnlyPath(f.path),
  );
  if (libraryAudio.some((f) => f.path === playingFile.path)) {
    return libraryAudio;
  }
  return [playingFile];
}

export function musicEffectivePlaylistIndex(
  playlist: MediaFile[],
  playingFile: MediaFile,
): number {
  return playlist.findIndex((f) => f.path === playingFile.path);
}

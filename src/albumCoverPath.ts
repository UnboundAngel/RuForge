import { bestCoverPath } from "./mediaKind";
import {
  playlistSidecarLocationFromTrackPath,
  type PlaylistSidecarLocation,
} from "./lib/playlistDownloadSidecar";

export const PLAYLIST_COVER_FILENAME = ".ruforge-playlist-cover.jpg";

export function playlistLocalCoverPath(location: PlaylistSidecarLocation): string {
  const base = location.outputDir.replace(/[/\\]+$/, "");
  const sep = location.outputDir.includes("\\") ? "\\" : "/";
  return `${base}${sep}Playlists${sep}${location.folderName}${sep}${PLAYLIST_COVER_FILENAME}`;
}

export function albumCoverPathForTrack(file: {
  path: string;
  embeddedCoverPath?: string | null;
  thumbnailPath?: string | null;
  ruforgePosterPath?: string | null;
}): string | null {
  const loc = playlistSidecarLocationFromTrackPath(file.path);
  if (loc) {
    return playlistLocalCoverPath(loc);
  }
  return bestCoverPath(file);
}

/** Every local cover worth trying for a track, best first: playlist sidecar, embedded art, thumbnail, poster. */
export function coverPathChain(file: {
  path: string;
  embeddedCoverPath?: string | null;
  thumbnailPath?: string | null;
  ruforgePosterPath?: string | null;
}): string[] {
  const loc = playlistSidecarLocationFromTrackPath(file.path);
  const all = [
    loc ? playlistLocalCoverPath(loc) : null,
    file.embeddedCoverPath,
    file.thumbnailPath,
    file.ruforgePosterPath,
  ];
  return [...new Set(all.filter((p): p is string => !!p))];
}
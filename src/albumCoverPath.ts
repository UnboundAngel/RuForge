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

export function albumCoverPathWithFallback(file: {
  path: string;
  embeddedCoverPath?: string | null;
  thumbnailPath?: string | null;
  ruforgePosterPath?: string | null;
}): { primary: string | null; fallback: string | null } {
  const loc = playlistSidecarLocationFromTrackPath(file.path);
  if (loc) {
    return {
      primary: playlistLocalCoverPath(loc),
      fallback: bestCoverPath(file),
    };
  }
  const cover = bestCoverPath(file);
  return { primary: cover, fallback: null };
}

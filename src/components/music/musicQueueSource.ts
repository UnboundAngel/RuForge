import type { MediaFile } from "@/types";

export type MusicQueueSourceKind =
  | "liked"
  | "album"
  | "artist"
  | "folder"
  | "search"
  | "library"
  | "quick_picks"
  | "recent"
  | "playlist"
  | "stats"
  | "track";

export type MusicQueueSource = {
  kind: MusicQueueSourceKind;
  label: string;
};

export function musicQueueSource(
  kind: MusicQueueSourceKind,
  label: string,
): MusicQueueSource {
  return { kind, label };
}

export function resolveQueueSourceLabel(
  source: MusicQueueSource | null,
  nextRowIsEndless: boolean,
): string | null {
  if (nextRowIsEndless) return "Library";
  const label = source?.label?.trim();
  return label || null;
}

export function queueNextSectionLabel(source: string | null): string {
  return source ? `Next from: ${source}` : "Next up";
}

export function nextQueueRowIsEndless(args: {
  manualQueueLength: number;
  playlistIndex: number;
  effectivePlaylist: MediaFile[];
  folderAudioPlaylist: MediaFile[];
  endlessFromIndex: number | null;
}): boolean {
  if (args.manualQueueLength > 0) return false;
  if (args.endlessFromIndex == null) return false;
  if (args.playlistIndex < 0) return false;

  const next = args.effectivePlaylist[args.playlistIndex + 1];
  if (!next) return false;

  const idxInFolder = args.folderAudioPlaylist.findIndex((f) => f.path === next.path);
  if (idxInFolder < 0) return true;
  return idxInFolder >= args.endlessFromIndex;
}

/**
 * True while the current song still comes from the source's own tracks. Once endless
 * autoplay takes over (or the song was never in the source list), the source no longer
 * counts as playing, the way Spotify drops the playlist's pause state after it ends.
 */
export function isPlayingFromQueueSource(args: {
  playingFile: MediaFile | null;
  folderAudioPlaylist: MediaFile[];
  endlessFromIndex: number | null;
  /** Set while a hand-queued song plays: where the source list resumes afterwards. */
  manualQueueContextIndex?: number | null;
}): boolean {
  const { playingFile, folderAudioPlaylist, endlessFromIndex, manualQueueContextIndex } = args;
  if (!playingFile) return false;
  // A hand-queued song interrupts the source without ending it, as in Spotify.
  const idx =
    manualQueueContextIndex != null
      ? manualQueueContextIndex
      : folderAudioPlaylist.findIndex((f) => f.path === playingFile.path);
  if (idx < 0) return false;
  return endlessFromIndex == null || idx < endlessFromIndex;
}

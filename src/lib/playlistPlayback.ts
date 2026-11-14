import type { MediaFile } from "../types";
import { isAudioOnlyPath } from "../mediaKind";
import { pickVideoEndScreenSuggestions } from "../videoEndScreenSuggestions";

/** Fisher-Yates copy; video playlists shuffle per action and never touch the sticky Music flag. */
export function shuffledCopy<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** True when a video is playing out of a queued video playlist (folderAudioPlaylist holds it as played order). */
export function isInVideoPlaylist(file: MediaFile, playlist: readonly MediaFile[]): boolean {
  return (
    playlist.length > 1 && !isAudioOnlyPath(file.path) && playlist.some((f) => f.path === file.path)
  );
}

/** Loop-all inside the playlist: the item after `file`, wrapping to the first. */
export function playlistLoopNext(file: MediaFile, playlist: readonly MediaFile[]): MediaFile | null {
  const idx = playlist.findIndex((f) => f.path === file.path);
  return idx < 0 ? null : playlist[(idx + 1) % playlist.length]!;
}

/**
 * End screen cards for a playlist video. Mid-playlist the first card is the next item so the
 * countdown advances in playlist order, independent of the audio auto-advance setting. At the
 * last item the cards are other playlist videos and nothing autoplays.
 */
export function playlistEndSuggestions(
  file: MediaFile,
  playlist: readonly MediaFile[],
): { suggestions: MediaFile[]; autoplay: boolean } {
  const idx = playlist.findIndex((f) => f.path === file.path);
  if (idx >= 0 && idx < playlist.length - 1) {
    return { suggestions: playlist.slice(idx + 1, idx + 3), autoplay: true };
  }
  return { suggestions: pickVideoEndScreenSuggestions(file.path, [...playlist]), autoplay: false };
}

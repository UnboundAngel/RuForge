import { isVideoWatched } from "./playbackStorage";
import type { MediaFile } from "./types";

export const VIDEO_END_SCREEN_COUNTDOWN_SEC = 12;

function shuffleInPlace<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * Pick up to 2 video end-screen suggestions: unwatched first, then random watched.
 * Never includes the current path.
 */
export function pickVideoEndScreenSuggestions(
  currentPath: string,
  library: MediaFile[],
  limit = 2,
  random: () => number = Math.random,
): MediaFile[] {
  if (limit <= 0) return [];
  const candidates = library.filter((f) => f.path !== currentPath);
  if (candidates.length === 0) return [];

  const unwatched: MediaFile[] = [];
  const watched: MediaFile[] = [];
  for (const file of candidates) {
    if (isVideoWatched(file.path, file.duration)) {
      watched.push(file);
    } else {
      unwatched.push(file);
    }
  }

  shuffleInPlace(unwatched, random);
  shuffleInPlace(watched, random);

  const picked: MediaFile[] = [];
  for (const file of unwatched) {
    if (picked.length >= limit) break;
    picked.push(file);
  }
  for (const file of watched) {
    if (picked.length >= limit) break;
    picked.push(file);
  }
  return picked;
}

import type { MediaFile } from "@/types";
import { buildSmartShuffleOrder } from "./musicSmartShuffle";

const LS_MUSIC_SHUFFLE = "ruforge-music-shuffle";

export function readMusicShuffleOnFromLs(): boolean {
  try {
    return localStorage.getItem(LS_MUSIC_SHUFFLE) === "1";
  } catch {
    return false;
  }
}

export function writeMusicShuffleOnToLs(on: boolean): void {
  try {
    if (on) localStorage.setItem(LS_MUSIC_SHUFFLE, "1");
    else localStorage.removeItem(LS_MUSIC_SHUFFLE);
  } catch {
    /* ignore */
  }
}

/** Current first, then weighted shuffle of the rest (Spotify: play this, shuffle up next). */
export function buildShuffledQueueFromBase(args: {
  base: MediaFile[];
  current: MediaFile;
  likedKeys?: string[];
  seed?: number;
}): MediaFile[] {
  const { base, current, likedKeys, seed } = args;
  if (base.length <= 1) return base.length === 0 ? [current] : [...base];
  const rest = base.filter((f) => f.path !== current.path);
  if (rest.length === 0) return [current];
  const shuffled = buildSmartShuffleOrder({
    pool: rest,
    current,
    likedKeys,
    seed: seed ?? (Date.now() & 0xffffffff),
  });
  return [current, ...shuffled];
}

/**
 * Restore source order for the current context.
 * Returns null when current is not in base (e.g. endless-only pick).
 */
export function restoreQueueFromBase(
  base: MediaFile[],
  current: MediaFile | null,
): MediaFile[] | null {
  if (base.length === 0) return null;
  if (!current) return [...base];
  if (!base.some((f) => f.path === current.path)) return null;
  return [...base];
}

export { LS_MUSIC_SHUFFLE };

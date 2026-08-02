import type { IslandSkipDir } from "@/components/island/islandSkipMotion";

let pending: IslandSkipDir | null = null;
/** Survives main DynamicIsland consume so the desktop overlay can animate too. */
let forBridge: IslandSkipDir | null = null;

/** Call before a track skip so island slide direction matches prev vs next. */
export function noteIslandSkipDir(dir: IslandSkipDir): void {
  pending = dir;
  forBridge = dir;
}

/** Read and clear the in-webview pending dir (main or overlay after bridge note). */
export function consumeIslandSkipDir(): IslandSkipDir {
  const dir = pending ?? 1;
  pending = null;
  return dir;
}

/** One-shot dir for the desktop-island state push after a track change. */
export function takeIslandSkipDirForBridge(): IslandSkipDir {
  const dir = forBridge ?? 1;
  forBridge = null;
  return dir;
}

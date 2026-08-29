import type { IslandSkipDir } from "@/components/island/islandSkipMotion";

let pending: IslandSkipDir | null = null;
/** Survives main DynamicIsland consume so the desktop overlay can animate too. */
let forBridge: IslandSkipDir | null = null;
/** Parallel one-shot for the expanded music vinyl hero (island consume does not clear this). */
let forHero: { dir: IslandSkipDir; at: number } | null = null;

const HERO_DIR_STALE_MS = 800;

/** Call before a track skip so island slide direction matches prev vs next. */
export function noteIslandSkipDir(dir: IslandSkipDir): void {
  pending = dir;
  forBridge = dir;
  forHero = { dir, at: Date.now() };
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

/**
 * One-shot dir for expanded AudioHeroStage / meta crossfade.
 * Expires quickly so a library pick after an old skip does not inherit direction.
 */
export function takeIslandSkipDirForHero(): IslandSkipDir {
  const note = forHero;
  forHero = null;
  if (!note) return 1;
  if (Date.now() - note.at > HERO_DIR_STALE_MS) return 1;
  return note.dir;
}

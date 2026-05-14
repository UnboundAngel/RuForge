/** Seconds from end treated as "finished" for resume — reopen starts at 0. */
export const END_EPSILON_SEC = 1.25;

/** Furthest position ≥ this fraction of duration counts as Watched. */
export const WATCHED_FRACTION = 0.9;

export function playbackPosKey(videoPath: string): string {
  return `ruforge-playback-pos:${videoPath}`;
}

function playbackDurKey(videoPath: string): string {
  return `ruforge-playback-dur:${videoPath}`;
}

/** Max media duration observed in playback (WebView metadata); used when gallery `duration` is still 0. */
export function readStoredPlaybackDuration(videoPath: string): number {
  const raw = localStorage.getItem(playbackDurKey(videoPath));
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function effectivePlaybackDuration(videoPath: string, catalogDuration: number): number {
  const cat = Number.isFinite(catalogDuration) && catalogDuration > 0 ? catalogDuration : 0;
  return Math.max(cat, readStoredPlaybackDuration(videoPath));
}

function readFurthestSeconds(videoPath: string): number {
  const raw = localStorage.getItem(playbackPosKey(videoPath));
  const saved = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(saved) && saved > 0 ? saved : 0;
}

export function readResumeSeconds(videoPath: string, durationSec: number): number {
  const furthest = readFurthestSeconds(videoPath);
  if (furthest <= 0.25) return 0;
  const dur = effectivePlaybackDuration(videoPath, durationSec);
  if (dur <= 0) return 0;
  if (furthest >= dur - END_EPSILON_SEC) return 0;
  return furthest;
}

/** Persists furthest-ever playback position; never decreases the stored value. */
export function writePlaybackPos(videoPath: string, seconds: number, durationSec?: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  let next = seconds;
  if (durationSec !== undefined && Number.isFinite(durationSec) && durationSec > 0) {
    next = Math.min(next, durationSec);
    const prevDur = readStoredPlaybackDuration(videoPath);
    if (durationSec > prevDur) {
      localStorage.setItem(playbackDurKey(videoPath), String(durationSec));
    }
  }
  const prev = readFurthestSeconds(videoPath);
  const merged = Math.max(prev, next);
  localStorage.setItem(playbackPosKey(videoPath), String(merged));
}

/** Thumbnail / UI progress: 0–100 from furthest position (0 if essentially unwatched). */
export function getWatchProgress(videoPath: string, durationSec: number): number {
  const dur = effectivePlaybackDuration(videoPath, durationSec);
  if (dur <= 0) return 0;
  const furthest = readFurthestSeconds(videoPath);
  if (furthest <= 0.5) return 0;
  return Math.min(100, (furthest / dur) * 100);
}

export function isVideoWatched(videoPath: string, durationSec: number): boolean {
  const dur = effectivePlaybackDuration(videoPath, durationSec);
  if (dur <= 0) return false;
  return readFurthestSeconds(videoPath) >= dur * WATCHED_FRACTION;
}

/** Bottom progress strip on library cards: hide when nothing to show; full width when completed. */
export function getPlaybackThumbnailBar(
  videoPath: string,
  catalogDuration: number,
): { show: boolean; widthPct: number; completed: boolean } {
  if (isVideoWatched(videoPath, catalogDuration)) {
    return { show: true, widthPct: 100, completed: true };
  }
  const p = getWatchProgress(videoPath, catalogDuration);
  if (p <= 0) return { show: false, widthPct: 0, completed: false };
  return { show: true, widthPct: p, completed: false };
}

export function clearPlaybackPos(videoPath: string) {
  localStorage.removeItem(playbackPosKey(videoPath));
  localStorage.removeItem(playbackDurKey(videoPath));
}

/** Seconds from end treated as "finished" — reopen from library starts at 0. */
export const END_EPSILON_SEC = 1.25;

export function playbackPosKey(videoPath: string): string {
  return `ruforge-playback-pos:${videoPath}`;
}

export function readResumeSeconds(videoPath: string, durationSec: number): number {
  const raw = localStorage.getItem(playbackPosKey(videoPath));
  const saved = raw ? parseFloat(raw) : NaN;
  if (!Number.isFinite(saved) || saved <= 0.25) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (saved >= durationSec - END_EPSILON_SEC) return 0;
  return saved;
}

export function writePlaybackPos(videoPath: string, seconds: number) {
  localStorage.setItem(playbackPosKey(videoPath), String(seconds));
}

export function clearPlaybackPos(videoPath: string) {
  localStorage.removeItem(playbackPosKey(videoPath));
}

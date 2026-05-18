export const LS_PLAYBACK_SPEED = "ruforge-playback-speed";

export function readPlaybackSpeed(): number {
  try {
    const raw = localStorage.getItem(LS_PLAYBACK_SPEED);
    if (!raw) return 1;
    const v = parseFloat(raw);
    return Number.isFinite(v) && v > 0 && v <= 4 ? v : 1;
  } catch {
    return 1;
  }
}

export function writePlaybackSpeed(speed: number): void {
  if (!Number.isFinite(speed) || speed <= 0) return;
  localStorage.setItem(LS_PLAYBACK_SPEED, String(speed));
}

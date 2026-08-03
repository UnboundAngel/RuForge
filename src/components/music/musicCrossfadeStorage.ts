/** Main-webview only. Does not sync to music-mini (separate webview localStorage). */
export const LS_MUSIC_CROSSFADE_SEC = "ruforge-music-crossfade-sec";

export const MUSIC_CROSSFADE_MAX_SEC = 12;
export const MUSIC_CROSSFADE_DEFAULT_SEC = 0;
export const MUSIC_CROSSFADE_SUGGESTED_SEC = 10;
export const MUSIC_CROSSFADE_PRELOAD_LEAD_SEC = 2;
export const MUSIC_CROSSFADE_MIN_SOLO_SEC = 18;

export function clampMusicCrossfadeSec(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.min(MUSIC_CROSSFADE_MAX_SEC, Math.round(sec * 10) / 10);
}

export function readMusicCrossfadeSec(): number {
  try {
    const raw = localStorage.getItem(LS_MUSIC_CROSSFADE_SEC);
    if (raw == null || raw === "") return MUSIC_CROSSFADE_DEFAULT_SEC;
    return clampMusicCrossfadeSec(parseFloat(raw));
  } catch {
    return MUSIC_CROSSFADE_DEFAULT_SEC;
  }
}

export function writeMusicCrossfadeSec(sec: number): void {
  const next = clampMusicCrossfadeSec(sec);
  try {
    if (next <= 0) localStorage.removeItem(LS_MUSIC_CROSSFADE_SEC);
    else localStorage.setItem(LS_MUSIC_CROSSFADE_SEC, String(next));
  } catch {
    /* ignore */
  }
}

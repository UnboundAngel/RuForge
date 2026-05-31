export const LS_MUSIC_ONLY_SKIP = "ruforge-music-only-skip";

export function readMusicOnlySkip(): boolean {
  try {
    return localStorage.getItem(LS_MUSIC_ONLY_SKIP) === "1";
  } catch {
    return false;
  }
}

export function writeMusicOnlySkip(enabled: boolean): void {
  try {
    localStorage.setItem(LS_MUSIC_ONLY_SKIP, enabled ? "1" : "0");
  } catch {
    // storage not available
  }
}

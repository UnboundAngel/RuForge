import { readPlaybackSpeed } from "@/playbackSpeedStorage";

const LS_MUSIC_SESSION = "ruforge-music-playback-session";

/** Last main-window music track before reload. Not per-library resume; one slot only. */

export type MusicPlaybackSession = {
  path: string;
  paused: boolean;
  currentTime: number;
  playbackSpeed: number;
  updatedAt: number;
};

export function writeMusicPlaybackSession(
  session: Pick<MusicPlaybackSession, "path" | "paused" | "currentTime"> & {
    playbackSpeed?: number;
  },
): void {
  if (!session.path) return;
  const payload: MusicPlaybackSession = {
    path: session.path,
    paused: session.paused,
    currentTime: Math.max(0, session.currentTime),
    playbackSpeed: session.playbackSpeed ?? readPlaybackSpeed(),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(LS_MUSIC_SESSION, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function readMusicPlaybackSession(): MusicPlaybackSession | null {
  try {
    const raw = localStorage.getItem(LS_MUSIC_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MusicPlaybackSession;
    if (!parsed?.path || typeof parsed.path !== "string") return null;
    return {
      path: parsed.path,
      paused: parsed.paused !== false,
      currentTime: Number.isFinite(parsed.currentTime) ? Math.max(0, parsed.currentTime) : 0,
      playbackSpeed:
        Number.isFinite(parsed.playbackSpeed) && parsed.playbackSpeed > 0
          ? parsed.playbackSpeed
          : readPlaybackSpeed(),
      updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearMusicPlaybackSession(): void {
  localStorage.removeItem(LS_MUSIC_SESSION);
}

import {
  isMusicPlaylistRecord,
  normalizeRecord,
  type VirtualPlaylistRecord,
} from "./virtualPlaylists";

/** Written next to the localStorage copy so hydration can tell which of the two is newer. */
export const MUSIC_PLAYLISTS_SAVED_AT_LS_KEY = "ruforge-music-playlists-saved-at";
export const MUSIC_PLAYLISTS_FILE_VERSION = 1;

export type MusicPlaylistsFile = {
  version: number;
  savedAt: number;
  playlists: VirtualPlaylistRecord[];
};

export function serializeMusicPlaylistsFile(
  records: VirtualPlaylistRecord[],
  savedAt: number,
): string {
  const file: MusicPlaylistsFile = {
    version: MUSIC_PLAYLISTS_FILE_VERSION,
    savedAt,
    playlists: records.filter(isMusicPlaylistRecord),
  };
  return JSON.stringify(file, null, 2);
}

/** `null` means the file is unreadable (bad JSON or wrong shape), not missing. */
export function parseMusicPlaylistsFile(raw: string): MusicPlaylistsFile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MusicPlaylistsFile> | null;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.playlists)) return null;
    const playlists = parsed.playlists
      .map((r) => normalizeRecord(r))
      .filter((r): r is VirtualPlaylistRecord => r != null && isMusicPlaylistRecord(r));
    const savedAt = typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;
    const version = typeof parsed.version === "number" ? parsed.version : MUSIC_PLAYLISTS_FILE_VERSION;
    return { version, savedAt, playlists };
  } catch {
    return null;
  }
}

/** Video playlists (Watch later and friends) always come from localStorage; music ones from `music`. */
export function replaceMusicRecords(
  local: VirtualPlaylistRecord[],
  music: VirtualPlaylistRecord[],
): VirtualPlaylistRecord[] {
  return [...local.filter((r) => !isMusicPlaylistRecord(r)), ...music];
}

export type FileReadResult =
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "ok"; file: MusicPlaylistsFile };

export function classifyFileRead(raw: string | null | undefined, failed = false): FileReadResult {
  if (failed) return { kind: "unreadable" };
  if (raw == null) return { kind: "missing" };
  const file = parseMusicPlaylistsFile(raw);
  return file ? { kind: "ok", file } : { kind: "unreadable" };
}

export type HydrationPlan = {
  records: VirtualPlaylistRecord[];
  /** Push `records` to the app-data file now (first-run migration, or the file fell behind). */
  writeFile: boolean;
  /** Push `records` to localStorage now (storage was reset, or the file is newer). */
  writeLocal: boolean;
  source: "file" | "local" | "migrated" | "fallback";
};

/**
 * Whichever copy was saved last wins as a whole, so a delete that reached only one copy
 * is not undone by a union. localStorage with no stamp predates the file, or was wiped.
 */
export function planMusicPlaylistsHydration(
  local: VirtualPlaylistRecord[],
  localSavedAt: number | null,
  read: FileReadResult,
): HydrationPlan {
  if (read.kind === "missing") {
    return { records: local, writeFile: true, writeLocal: false, source: "migrated" };
  }
  if (read.kind === "unreadable") {
    // Leave the damaged file for manual recovery; the next edit overwrites it.
    return { records: local, writeFile: false, writeLocal: false, source: "fallback" };
  }
  const { file } = read;
  if (localSavedAt != null && localSavedAt >= file.savedAt) {
    return { records: local, writeFile: localSavedAt > file.savedAt, writeLocal: false, source: "local" };
  }
  return {
    records: replaceMusicRecords(local, file.playlists),
    writeFile: false,
    writeLocal: true,
    source: "file",
  };
}

export function readLocalSavedAt(): number | null {
  try {
    const raw = localStorage.getItem(MUSIC_PLAYLISTS_SAVED_AT_LS_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeLocalSavedAt(savedAt: number): void {
  try {
    localStorage.setItem(MUSIC_PLAYLISTS_SAVED_AT_LS_KEY, String(savedAt));
  } catch {
    /* the file copy still carries the stamp */
  }
}

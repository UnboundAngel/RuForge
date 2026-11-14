import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { VIRTUAL_PLAYLIST_PATH_PREFIX } from "../../virtualPlaylists";
import { EMPTY_SESSION, parseSessions, type PlaylistSession, type PlaylistSessions } from "./logic";

const WRITE_DEBOUNCE_MS = 500;
const FILE_VERSION = 1;

let sessions: PlaylistSessions = {};
let hydrated = false;
let loaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** Island and overlay webviews share the app data dir; only the main window owns the file. */
function diskEnabled(): boolean {
  try {
    return isTauri() && getCurrentWindow().label === "main";
  } catch {
    return false;
  }
}

/** Virtual playlists are keyed by record id, folder playlists by path. */
export function canonicalPlaylistId(id: string): string {
  return id.startsWith(VIRTUAL_PLAYLIST_PATH_PREFIX) ? id.slice(VIRTUAL_PLAYLIST_PATH_PREFIX.length) : id;
}

function flush(): void {
  timer = null;
  const contents = JSON.stringify({ version: FILE_VERSION, sessions });
  void invoke("write_playlist_progress_file", { contents }).catch(() => {});
}

function emit(): void {
  for (const l of listeners) l();
}

export function getSessions(): PlaylistSessions {
  return sessions;
}

export function getSession(id: string): PlaylistSession {
  return sessions[canonicalPlaylistId(id)] ?? EMPTY_SESSION;
}

export function subscribeSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replaces one session; saves to disk on a debounce so the UI never waits on it. */
export function writeSession(id: string, next: PlaylistSession): void {
  const key = canonicalPlaylistId(id);
  if (sessions[key] === next) return;
  sessions = { ...sessions, [key]: next };
  emit();
  // Writing before the first read lands would clobber the file we have not loaded yet.
  if (!diskEnabled() || !loaded) return;
  if (timer == null) timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
}

/** Loads the file once; anything written while it loaded is newer and wins. */
export async function hydratePlaylistSessions(): Promise<void> {
  if (hydrated || !diskEnabled()) return;
  hydrated = true;
  try {
    const raw = await invoke<string | null>("read_playlist_progress_file");
    if (!raw) return;
    const fromDisk = parseSessions(JSON.parse(raw));
    sessions = { ...fromDisk, ...sessions };
    emit();
  } catch {
    /* unreadable file: start empty rather than block playback */
  }
  loaded = true;
  if (timer == null && Object.keys(sessions).length > 0) timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
}

/** Test seam: forget everything without touching disk. */
export function resetPlaylistSessionsForTest(next: PlaylistSessions = {}): void {
  sessions = next;
  emit();
}

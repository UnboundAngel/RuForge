import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Pre-disk location; read once to migrate, then removed. */
const LEGACY_SESSION_KEY = "ruforge-download-queue";
const WRITE_DEBOUNCE_MS = 400;

let cachedRaw: string | null = null;
let hydrated = false;
let pending: { raw: string | null } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Island and overlay webviews share the app data dir; only the main window owns the queue file. */
function diskEnabled(): boolean {
  try {
    return isTauri() && getCurrentWindow().label === "main";
  } catch {
    return false;
  }
}

function readLegacySession(): string | null {
  try {
    return sessionStorage.getItem(LEGACY_SESSION_KEY);
  } catch {
    return null;
  }
}

function clearLegacySession(): void {
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function parseJobs(raw: string): { id?: unknown; url?: unknown }[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as { id?: unknown; url?: unknown }[]) : [];
  } catch {
    return [];
  }
}

/** Saved jobs not already in `newer` (by id or url) go first, as they were queued earlier. */
export function mergeQueueRaw(saved: string, newer: string): string {
  const fresh = parseJobs(newer);
  const ids = new Set(fresh.map((j) => j.id));
  const urls = new Set(fresh.map((j) => j.url));
  const older = parseJobs(saved).filter((j) => !ids.has(j.id) && !urls.has(j.url));
  return older.length === 0 ? newer : JSON.stringify([...older, ...fresh]);
}

/** Latest known queue JSON: disk cache first, then a not-yet-migrated session copy. */
export function readQueueRaw(): string | null {
  return cachedRaw ?? readLegacySession();
}

function flush(): void {
  timer = null;
  if (!pending) return;
  const { raw } = pending;
  pending = null;
  void invoke("write_download_queue_file", { contents: raw }).catch(() => {});
}

/** Debounced async write; `null` clears the file. The UI never waits on disk. */
export function writeQueueRaw(raw: string | null): void {
  clearLegacySession();
  if (!diskEnabled()) return;
  cachedRaw = raw;
  // Before the first load finishes an empty save would erase the file we have not read yet.
  if (!hydrated && raw === null) return;
  pending = { raw };
  if (timer == null) timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
}

/**
 * Load the queue file into the cache, migrating a leftover sessionStorage copy once. The store's
 * existing "restore when empty" path then picks it up the next time the downloader opens.
 */
export async function hydrateDownloadQueueFromDisk(): Promise<void> {
  if (hydrated || !diskEnabled()) return;
  try {
    const raw = await invoke<string | null>("read_download_queue_file");
    // A save made while the read was in flight is newer than the file, but only knows the jobs
    // added this launch: keep the saved ones too.
    if (cachedRaw == null) cachedRaw = raw;
    else if (raw) {
      const merged = mergeQueueRaw(raw, cachedRaw);
      if (merged !== cachedRaw) {
        cachedRaw = merged;
        pending = { raw: merged };
      }
    }
    if (cachedRaw == null) {
      const legacy = readLegacySession();
      if (legacy) {
        cachedRaw = legacy;
        pending = { raw: legacy };
      }
    }
    clearLegacySession();
  } catch {
    /* unreadable file: start empty rather than block launch */
  }
  hydrated = true;
  if (pending) flush();
}

if (typeof window !== "undefined") {
  void hydrateDownloadQueueFromDisk();
  window.addEventListener("beforeunload", () => {
    if (timer != null) {
      clearTimeout(timer);
      flush();
    }
  });
}

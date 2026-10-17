import { invoke } from "@tauri-apps/api/core";

export const SETTINGS_LS_KEY = "ruforge-settings";

export type SettingsSource =
  /** The app-data file holds settings: it wins and replaces localStorage. */
  | "file"
  /** No file yet (first run after this shipped): localStorage seeds it. */
  | "seed"
  /** Nothing to sync, or the file is damaged and is left for manual recovery. */
  | "none";

function isSettingsObject(raw: string | null): boolean {
  if (raw == null) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** localStorage is only a synchronous cache; when a settings file exists it is the truth. */
export function pickSettingsSource(
  fileRaw: string | null,
  localRaw: string | null,
  readFailed: boolean,
): SettingsSource {
  if (readFailed) return "none";
  if (fileRaw == null) return isSettingsObject(localRaw) ? "seed" : "none";
  return isSettingsObject(fileRaw) ? "file" : "none";
}

let ready = false;
let writing = false;
let pending: string | null = null;

async function drainWrites(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pending != null) {
      const contents = pending;
      pending = null;
      try {
        await invoke("write_settings_file", { contents });
      } catch (e) {
        console.warn("settings file write failed; localStorage still has them", e);
      }
    }
  } finally {
    writing = false;
  }
}

/** Called on every settings save. Does nothing until the main window has picked a source, so a fresh webview cannot clobber the file. */
export function mirrorSettingsToFile(text: string): void {
  if (!ready) return;
  pending = text;
  void drainWrites();
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(SETTINGS_LS_KEY);
  } catch {
    return null;
  }
}

/**
 * Main window only, before first render. Resolves true when localStorage was replaced from
 * the file, so the caller must rehydrate the store.
 */
export async function hydrateSettingsFromFile(): Promise<boolean> {
  let fileRaw: string | null = null;
  let failed = false;
  try {
    fileRaw = await invoke<string | null>("read_settings_file");
  } catch {
    failed = true;
  }
  const local = readLocal();
  const source = pickSettingsSource(fileRaw, local, failed);
  // Writes stay off when the read failed (no Tauri, locked file) so nothing overwrites an unread file.
  ready = !failed;
  if (ready) {
    // Other windows save straight to localStorage; the main window is the single file writer.
    window.addEventListener("storage", (e) => {
      if (e.key === SETTINGS_LS_KEY && e.newValue) mirrorSettingsToFile(e.newValue);
    });
  }
  if (source === "seed" && local) {
    mirrorSettingsToFile(local);
    return false;
  }
  if (source === "file" && fileRaw != null && fileRaw !== local) {
    try {
      localStorage.setItem(SETTINGS_LS_KEY, fileRaw);
    } catch {
      return false;
    }
    return true;
  }
  return false;
}

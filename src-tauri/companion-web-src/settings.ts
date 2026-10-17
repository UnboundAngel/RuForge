export type OfflineSettings = {
  /** Save a track or video for offline use as soon as it is played. */
  autosave: boolean;
  /** Offline storage cap in megabytes; oldest saves go first. */
  storageLimitMb: number;
  /** Start the next item when one ends. */
  autoplay: boolean;
  /** Intro sheets already shown, so each event explains itself once. */
  seen: string[];
};

const KEY = "rf_companion_settings";

export const DEFAULT_SETTINGS: OfflineSettings = {
  autosave: false,
  storageLimitMb: 2048,
  autoplay: true,
  seen: [],
};

export function readSettings(): OfflineSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<OfflineSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed, seen: Array.isArray(parsed.seen) ? parsed.seen : [] };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(next: OfflineSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function hasSeen(id: string): boolean {
  return readSettings().seen.includes(id);
}

export function markSeen(id: string) {
  const s = readSettings();
  if (!s.seen.includes(id)) writeSettings({ ...s, seen: [...s.seen, id] });
}

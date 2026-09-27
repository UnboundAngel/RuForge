import type { ImportRow } from "./importSession";

/** Main-webview localStorage; survives a refresh or restart, cleared on save or start over. */
export const IMPORT_SESSION_KEY = "ruforge-music-import-session";
const SAVED_VERSION = 1;

export type SavedImportSession = {
  phase: "paste" | "review";
  name: string;
  rows: ImportRow[];
  notes: string[];
  stopped: string | null;
  draft: string;
};

export function isEmptySession(s: SavedImportSession): boolean {
  return !s.rows.length && !s.draft.trim();
}

export function serializeImportSession(s: SavedImportSession): string | null {
  if (isEmptySession(s)) return null;
  const { phase, name, rows, notes, stopped, draft } = s;
  return JSON.stringify({ v: SAVED_VERSION, phase, name, rows, notes, stopped, draft });
}

function validRow(r: unknown): r is ImportRow {
  if (!r || typeof r !== "object") return false;
  const o = r as Partial<ImportRow>;
  return (
    !!o.source &&
    typeof o.source.title === "string" &&
    Array.isArray(o.source.artists) &&
    Array.isArray(o.candidates) &&
    typeof o.choice === "number" &&
    typeof o.include === "boolean"
  );
}

/**
 * Anything unreadable or from another version is dropped rather than half-restored. A row that
 * was mid-search when the app closed goes back to waiting so matching picks it up again.
 */
export function restoreImportSession(raw: string | null): SavedImportSession | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<SavedImportSession> & { v?: number };
    if (o.v !== SAVED_VERSION || !Array.isArray(o.rows) || !o.rows.every(validRow)) return null;
    const rows = o.rows.map((r) => (r.state === "searching" ? { ...r, state: "waiting" as const } : r));
    const phase = o.phase === "review" && rows.length ? "review" : "paste";
    const saved: SavedImportSession = {
      phase,
      name: typeof o.name === "string" ? o.name : "",
      rows: phase === "review" ? rows : [],
      notes: Array.isArray(o.notes) ? o.notes.filter((n): n is string => typeof n === "string") : [],
      stopped: typeof o.stopped === "string" ? o.stopped : null,
      draft: typeof o.draft === "string" ? o.draft : "",
    };
    return isEmptySession(saved) ? null : saved;
  } catch {
    return null;
  }
}

export function hasPendingSearches(rows: ImportRow[]): boolean {
  return rows.some((r) => r.state === "waiting");
}

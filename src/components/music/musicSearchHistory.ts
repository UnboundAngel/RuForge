import { useSyncExternalStore } from "react";

const KEY = "rf-music-search-history";
const MAX = 15;

export type MusicSearchHistoryEntry = { query: string; at: number };

let cache: MusicSearchHistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): MusicSearchHistoryEntry[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed)
      ? parsed
          .map((e): MusicSearchHistoryEntry | null =>
            typeof e === "string"
              ? { query: e, at: 0 }
              : e && typeof e.query === "string"
                ? { query: e.query, at: Number(e.at) || 0 }
                : null,
          )
          .filter((e): e is MusicSearchHistoryEntry => e != null)
          .slice(0, MAX)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: MusicSearchHistoryEntry[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode: history just won't persist */
  }
  listeners.forEach((l) => l());
}

export function rememberMusicSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  const lower = q.toLowerCase();
  write([{ query: q, at: Date.now() }, ...read().filter((e) => e.query.toLowerCase() !== lower)].slice(0, MAX));
}

export function forgetMusicSearch(query: string) {
  write(read().filter((e) => e.query !== query));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMusicSearchHistory(): MusicSearchHistoryEntry[] {
  return useSyncExternalStore(subscribe, read, read);
}

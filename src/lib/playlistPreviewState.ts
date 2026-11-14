import { useSyncExternalStore } from "react";

/**
 * Session state of the playlist preview in the downloader: which rows the user cancelled, which rows
 * failed their size probe, and whether the row listing is still streaming in. Memory only; it dies
 * with the pasted link.
 */
export type PlaylistPreviewState = {
  url: string | null;
  /** Row keys (`playlistItemKey`) the user cancelled. */
  excluded: ReadonlySet<string>;
  /** Row id to a short reason the size probe failed. */
  sizeErrors: ReadonlyMap<string, string>;
  /** True while rows are still arriving from yt-dlp. */
  listing: boolean;
  /** Playlist length reported by yt-dlp, when known. */
  expected: number | null;
  /** Last row the user clicked cancel on, the start of a shift range. */
  anchor: string | null;
};

const EMPTY: PlaylistPreviewState = {
  url: null,
  excluded: new Set(),
  sizeErrors: new Map(),
  listing: false,
  expected: null,
  anchor: null,
};

let state: PlaylistPreviewState = EMPTY;
const listeners = new Set<() => void>();

function commit(next: PlaylistPreviewState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function getPlaylistPreviewState(): PlaylistPreviewState {
  return state;
}

export function usePlaylistPreviewState(): PlaylistPreviewState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getPlaylistPreviewState,
    getPlaylistPreviewState,
  );
}

/** Starts a fresh preview for `url`; a repeat call for the same url keeps what the user already did. */
export function beginPlaylistPreview(url: string): void {
  if (state.url === url) return;
  commit({ ...EMPTY, url, listing: true });
}

export function endPlaylistPreview(): void {
  if (state === EMPTY) return;
  commit(EMPTY);
}

export function setPlaylistListing(url: string, listing: boolean, expected?: number | null): void {
  if (state.url !== url) return;
  const nextExpected = expected === undefined ? state.expected : expected;
  if (state.listing === listing && state.expected === nextExpected) return;
  commit({ ...state, listing, expected: nextExpected });
}

/** Cancels or restores `keys` in one step. */
export function setPlaylistRowsExcluded(keys: string[], excluded: boolean, anchor: string | null): void {
  const next = new Set(state.excluded);
  for (const k of keys) {
    if (excluded) next.add(k);
    else next.delete(k);
  }
  commit({ ...state, excluded: next, anchor });
}

/**
 * Keys between `from` and `to` (inclusive) in the order the rows are shown. Falls back to just `to`
 * when the anchor is no longer on screen.
 */
export function keysInRange(ordered: string[], from: string | null, to: string): string[] {
  const b = ordered.indexOf(to);
  const a = from == null ? -1 : ordered.indexOf(from);
  if (b < 0) return [];
  if (a < 0) return [to];
  return ordered.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export function recordPlaylistSizeErrors(ids: string[], reason: string): void {
  if (ids.length === 0) return;
  const next = new Map(state.sizeErrors);
  for (const id of ids) next.set(id, reason);
  commit({ ...state, sizeErrors: next });
}

export function clearPlaylistSizeErrors(ids: string[]): void {
  if (!ids.some((id) => state.sizeErrors.has(id))) return;
  const next = new Map(state.sizeErrors);
  for (const id of ids) next.delete(id);
  commit({ ...state, sizeErrors: next });
}

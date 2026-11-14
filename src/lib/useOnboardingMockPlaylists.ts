import { useEffect, useMemo, useSyncExternalStore } from "react";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { GalleryEntry, MediaFile, PlaylistCollection } from "@/types";
import {
  getOnboardingMock,
  onOnboardingMockCleared,
  registerOnboardingMockHold,
  releaseOnboardingMockHold,
  subscribeOnboardingMock,
} from "./onboardingMock";
import {
  buildDemoPlaylist,
  isDemoPlaylistPath,
  pickDemoItems,
  reorderDemoItems,
  shouldShowDemoPlaylist,
} from "./onboardingMockPlaylists";

/**
 * Where the demo playlist's rows live while the tour runs. Memory only: the demo never reaches
 * `virtualPlaylistRecords`, localStorage or disk, so a crash or restart leaves nothing behind.
 */

/** Long enough for the detail page's exit fade to finish with its rows still in place. */
const ITEMS_DROP_DELAY_MS = 600;

let demoItems: MediaFile[] | null = null;
const listeners = new Set<() => void>();

function setDemoItems(next: MediaFile[] | null): void {
  demoItems = next;
  for (const l of listeners) l();
}

function subscribeItems(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getItems = () => demoItems;

// A selected demo page must never outlive the mock, or Back would land on content that is gone.
onOnboardingMockCleared(() => {
  const s = useRuforgeStore.getState();
  if (isDemoPlaylistPath(s.selectedPlaylist?.path)) s.setSelectedPlaylist(null);
  setTimeout(() => {
    if (!getOnboardingMock().kind) setDemoItems(null);
  }, ITEMS_DROP_DELAY_MS);
});

registerOnboardingMockHold(() => isDemoPlaylistPath(useRuforgeStore.getState().selectedPlaylist?.path));

export function useOnboardingMock() {
  return useSyncExternalStore(subscribeOnboardingMock, getOnboardingMock);
}

/** Reorders the demo in memory; the real reorder paths write to storage and must not run for it. */
export function reorderDemoPlaylist(fromKey: string, toKey: string): void {
  if (demoItems) setDemoItems(reorderDemoItems(demoItems, fromKey, toKey));
}

/** Playlists grid input: the demo goes first while the tour wants it, the user's own follow. */
export function useDemoPlaylistStacks(
  filtered: readonly GalleryEntry[],
  entries: readonly GalleryEntry[],
  active: boolean,
): PlaylistCollection[] {
  const stacks = useMemo(
    () => filtered.filter((e): e is PlaylistCollection => e.kind === "playlist"),
    [filtered],
  );
  const mock = useOnboardingMock();
  const items = useSyncExternalStore(subscribeItems, getItems);
  const show = active && shouldShowDemoPlaylist(mock, entries);

  useEffect(() => {
    if (show && !demoItems) setDemoItems(pickDemoItems(flattenGalleryScanToMediaFiles(entries)));
  }, [show, entries]);

  const forced = mock.forced;
  return useMemo(() => {
    if (!show || !items) return stacks;
    const demo = buildDemoPlaylist(items);
    // A forced preview replaces the user's playlists so the capture shows only the demo.
    return forced ? [demo] : [demo, ...stacks];
  }, [show, items, stacks, forced]);
}

/** Detail page input: the demo's current order, or the playlist untouched for every real one. */
export function useDemoPlaylistView(playlist: PlaylistCollection): PlaylistCollection {
  const items = useSyncExternalStore(subscribeItems, getItems);
  const demo = isDemoPlaylistPath(playlist.path);
  return useMemo(() => (demo && items ? buildDemoPlaylist(items) : playlist), [demo, items, playlist]);
}

/**
 * The demo page stays up after the tour ends while the user reads it. Leaving it (Back, another
 * tab) starts the normal fade; the hold's own timeout covers a user who just stays.
 */
export function useDemoPlaylistLeave(isDemo: boolean): void {
  useEffect(() => {
    if (!isDemo) return;
    return () => releaseOnboardingMockHold();
  }, [isDemo]);
}

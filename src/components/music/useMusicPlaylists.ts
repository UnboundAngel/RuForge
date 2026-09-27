import { useMemo } from "react";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { isAudioOnlyPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { musicPlaylistRecords } from "./musicPlaylists";

// Shared across every mounted caller, so Home, the top bar and the sidebar flatten the
// library once per scan instead of once each.
const libraryTracksCache = new WeakMap<object, MediaFile[]>();

export function libraryTracksFor(entries: object): MediaFile[] {
  let tracks = libraryTracksCache.get(entries);
  if (!tracks) {
    tracks = flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path));
    libraryTracksCache.set(entries, tracks);
  }
  return tracks;
}

export function useMusicLibraryTracks() {
  const entries = useRuforgeStore((s) => s.entries);
  return useMemo(() => libraryTracksFor(entries), [entries]);
}

export function useMusicPlaylistRecords() {
  const records = useRuforgeStore((s) => s.virtualPlaylistRecords);
  return useMemo(() => musicPlaylistRecords(records), [records]);
}

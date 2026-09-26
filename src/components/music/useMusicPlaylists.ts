import { useMemo } from "react";
import { flattenGalleryScanToMediaFiles } from "@/galleryScan";
import { isAudioOnlyPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { musicPlaylistRecords } from "./musicPlaylists";

export function useMusicLibraryTracks() {
  const entries = useRuforgeStore((s) => s.entries);
  return useMemo(
    () => flattenGalleryScanToMediaFiles(entries).filter((f) => isAudioOnlyPath(f.path)),
    [entries],
  );
}

export function useMusicPlaylistRecords() {
  const records = useRuforgeStore((s) => s.virtualPlaylistRecords);
  return useMemo(() => musicPlaylistRecords(records), [records]);
}

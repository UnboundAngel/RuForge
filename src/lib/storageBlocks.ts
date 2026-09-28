import type { RuforgeStore } from "../store/ruforgeStore";

export const STORAGE_FULL_NOTIFY =
  "Library storage limit reached. Free space in Settings or switch to an external download folder.";

/** Only the internal vault has a cap; custom folders are never blocked here. */
export function storageBlocksNewDownloads(
  s: Pick<RuforgeStore, "saveToInternal" | "storageStats" | "settings">,
): boolean {
  return (
    s.saveToInternal &&
    (s.storageStats
      ? s.storageStats.total_bytes / (1024 * 1024 * 1024) >= s.settings.storageLimitGB
      : false)
  );
}

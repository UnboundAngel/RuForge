import { storageBlocksNewDownloads } from "@/lib/storageBlocks";
import type { RuforgeStore } from "@/store/ruforgeStore";
import { extractYouTubeVideoId } from "@/youtubeUrl";
import type { NotificationItem } from "./types";

type StorageInputs = Pick<RuforgeStore, "saveToInternal" | "storageStats" | "settings">;

const NONE: ReadonlySet<string> = new Set();

export function notificationVideoId(item: NotificationItem): string | null {
  return item.ref.videoId ?? (item.ref.url ? extractYouTubeVideoId(item.ref.url) : null);
}

export function storageInputsChanged(a: StorageInputs, b: StorageInputs): boolean {
  return (
    a.saveToInternal !== b.saveToInternal ||
    a.storageStats !== b.storageStats ||
    a.settings.storageLimitGB !== b.settings.storageLimitGB
  );
}

/** Holds only show while storage still blocks, so freeing space clears every badge at once. */
export function activeStorageHolds(held: ReadonlySet<string>, s: StorageInputs): ReadonlySet<string> {
  return held.size > 0 && storageBlocksNewDownloads(s) ? held : NONE;
}

/** The held row badges itself and offers storage settings instead of a separate "Storage limit reached" row. */
export function withStorageHolds(items: NotificationItem[], held: ReadonlySet<string>): NotificationItem[] {
  if (held.size === 0) return items;
  let changed = false;
  const out = items.map((item) => {
    if (item.kind === "download-blocked") return item;
    const id = notificationVideoId(item);
    if (!id || !held.has(id)) return item;
    changed = true;
    const actions = item.actions.includes("open-storage-settings")
      ? item.actions
      : [...item.actions, "open-storage-settings" as const];
    return { ...item, actions, ref: { ...item.ref, storageHeld: true } };
  });
  return changed ? out : items;
}

import { invoke } from "@tauri-apps/api/core";

export type RecentlyDeletedEntry = {
  id: string;
  title: string;
  mediaPath: string;
  deletedAt: string;
  files: string[];
  recoverable: boolean;
};

export type RestoreRecentlyDeletedResult = {
  restored: boolean;
  recoverable: boolean;
  warnings: string[];
};

export function listRecentlyDeleted(): Promise<RecentlyDeletedEntry[]> {
  return invoke<RecentlyDeletedEntry[]>("list_recently_deleted");
}

export function restoreRecentlyDeleted(entryId: string): Promise<RestoreRecentlyDeletedResult> {
  return invoke<RestoreRecentlyDeletedResult>("restore_recently_deleted", { entryId });
}

export function removeRecentlyDeletedEntry(entryId: string): Promise<void> {
  return invoke("remove_recently_deleted_entry", { entryId });
}

import { invoke } from "@tauri-apps/api/core";
import type { ListenSnapshot } from "./musicListenTypes";
import { EMPTY_LISTEN_SNAPSHOT } from "./musicListenTypes";

let cached: ListenSnapshot = EMPTY_LISTEN_SNAPSHOT;

export function getCachedListenSnapshot(): ListenSnapshot {
  return cached;
}

export function setCachedListenSnapshot(snapshot: ListenSnapshot): void {
  cached = snapshot;
}

export async function refreshListenSnapshot(): Promise<ListenSnapshot> {
  try {
    const snap = await invoke<ListenSnapshot>("music_listen_get_snapshot");
    cached = snap;
    return snap;
  } catch {
    return cached;
  }
}

export async function rebuildListenSnapshot(): Promise<ListenSnapshot> {
  const snap = await invoke<ListenSnapshot>("music_listen_rebuild_snapshot");
  cached = snap;
  return snap;
}

/** Vitest-only: inject snapshot without Tauri. */
export function setListenSnapshotForTests(snapshot: ListenSnapshot): void {
  cached = snapshot;
}

export function resetListenSnapshotForTests(): void {
  cached = EMPTY_LISTEN_SNAPSHOT;
}

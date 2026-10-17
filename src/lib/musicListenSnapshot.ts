import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ListenSnapshot } from "./musicListenTypes";
import { EMPTY_LISTEN_SNAPSHOT } from "./musicListenTypes";

let cached: ListenSnapshot = EMPTY_LISTEN_SNAPSHOT;
let ready = false;
let revision = 0;
const listeners = new Set<() => void>();

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function getCachedListenSnapshot(): ListenSnapshot {
  return cached;
}

export function isListenSnapshotReady(): boolean {
  return ready;
}

export function getListenSnapshotRevision(): number {
  return revision;
}

export function subscribeListenSnapshot(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function setCachedListenSnapshot(snapshot: ListenSnapshot): void {
  cached = snapshot;
  ready = true;
  notify();
}

function markSettled(): void {
  ready = true;
  notify();
}

export async function refreshListenSnapshot(): Promise<ListenSnapshot> {
  try {
    const snap = await invoke<ListenSnapshot>("music_listen_get_snapshot");
    cached = snap;
    return snap;
  } catch {
    return cached;
  } finally {
    markSettled();
  }
}

export async function rebuildListenSnapshot(): Promise<ListenSnapshot> {
  try {
    const snap = await invoke<ListenSnapshot>("music_listen_rebuild_snapshot");
    cached = snap;
    return snap;
  } finally {
    markSettled();
  }
}

/** Vitest-only: inject snapshot without Tauri. */
export function setListenSnapshotForTests(snapshot: ListenSnapshot): void {
  cached = snapshot;
  ready = true;
  notify();
}

export function resetListenSnapshotForTests(): void {
  cached = EMPTY_LISTEN_SNAPSHOT;
  ready = false;
  notify();
}

/** Re-render when the listen snapshot loads or refreshes. */
export function useListenSnapshotRevision(): number {
  return useSyncExternalStore(
    subscribeListenSnapshot,
    getListenSnapshotRevision,
    getListenSnapshotRevision,
  );
}

/** False until the first snapshot fetch attempt finishes. */
export function useListenSnapshotReady(): boolean {
  return useSyncExternalStore(
    subscribeListenSnapshot,
    isListenSnapshotReady,
    () => true,
  );
}

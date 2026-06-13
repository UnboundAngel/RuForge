import type { MainPlaybackSnapshot } from "@/context/MainPlaybackContext";
import type { MainPlaybackBridgeOwner } from "@/playback/bridgeArbitration";

let snapshot: MainPlaybackSnapshot | null = null;
let owner: MainPlaybackBridgeOwner | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function publishMainPlaybackBridge(
  bridgeOwner: MainPlaybackBridgeOwner,
  value: MainPlaybackSnapshot | null,
) {
  if (value === null) {
    if (owner === bridgeOwner) {
      owner = null;
      snapshot = null;
      notify();
    }
    return;
  }
  owner = bridgeOwner;
  snapshot = value;
  notify();
}

/** @deprecated Use publishMainPlaybackBridge with owner. Kept for incremental migration. */
export function setMainPlaybackBridge(value: MainPlaybackSnapshot | null) {
  if (value === null) {
    owner = null;
    snapshot = null;
  } else {
    snapshot = value;
  }
  notify();
}

export function getMainPlaybackBridgeOwner(): MainPlaybackBridgeOwner | null {
  return owner;
}

export function getMainPlaybackBridge(): MainPlaybackSnapshot | null {
  return snapshot;
}

export function subscribeMainPlaybackBridge(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

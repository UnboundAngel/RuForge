import type { MainPlaybackSnapshot } from "@/context/MainPlaybackContext";
import type { MainPlaybackBridgeOwner } from "@/playback/bridgeArbitration";

let snapshot: MainPlaybackSnapshot | null = null;
let owner: MainPlaybackBridgeOwner | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function stabilizePaused(
  prev: MainPlaybackSnapshot | null,
  currentTime: number,
  paused: boolean,
): boolean {
  if (prev && paused !== prev.paused) {
    return paused;
  }

  if (paused && prev && !prev.paused && currentTime > prev.currentTime + 0.025) {
    return false;
  }

  return paused;
}

function mergeSnapshot(
  bridgeOwner: MainPlaybackBridgeOwner,
  value: MainPlaybackSnapshot,
): MainPlaybackSnapshot {
  const prev = owner === bridgeOwner ? snapshot : null;

  let currentTime = value.currentTime;
  let paused = value.paused;

  if (prev) {
    if (
      currentTime < prev.currentTime - 0.75 &&
      !paused &&
      prev.currentTime > 1.5
    ) {
      currentTime = prev.currentTime;
    }
  }

  if (bridgeOwner === "player-video") {
    return {
      ...value,
      currentTime,
      paused: value.paused,
    };
  }

  paused = stabilizePaused(prev, currentTime, paused);

  return {
    ...value,
    currentTime,
    paused,
  };
}

function snapshotsEqual(a: MainPlaybackSnapshot, b: MainPlaybackSnapshot): boolean {
  return (
    a.paused === b.paused &&
    a.duration === b.duration &&
    Math.abs(a.currentTime - b.currentTime) < 0.05
  );
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

  const next = mergeSnapshot(bridgeOwner, value);
  if (snapshot && owner === bridgeOwner && snapshotsEqual(snapshot, next)) {
    return;
  }

  owner = bridgeOwner;
  snapshot = next;
  notify();
}

/** Video island path: patch telemetry without replacing callback refs. */
export function patchMainPlaybackBridgeTelemetry(
  bridgeOwner: MainPlaybackBridgeOwner,
  patch: Pick<MainPlaybackSnapshot, "paused" | "currentTime" | "duration">,
) {
  if (owner !== bridgeOwner || !snapshot) return;

  publishMainPlaybackBridge(bridgeOwner, {
    ...snapshot,
    ...patch,
  });
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

import { useSyncExternalStore } from "react";

/**
 * Session-only switch for Recording mode (fake glide cursor and eased wheel scrolling for demo
 * captures). Not persisted on purpose: a restart always comes back with it off. The window event
 * lets scripts/dev/record.mjs flip it from outside React without a store handle.
 */

export const RECORDING_MODE_EVENT = "ruforge-recording-mode";

let on = false;
const listeners = new Set<() => void>();

export function setRecordingMode(next: boolean): void {
  if (next === on) return;
  on = next;
  listeners.forEach((fn) => fn());
}

export const isRecordingMode = () => on;

window.addEventListener(RECORDING_MODE_EVENT, (e) => setRecordingMode((e as CustomEvent<boolean>).detail === true));

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useRecordingMode = () => useSyncExternalStore(subscribe, isRecordingMode);

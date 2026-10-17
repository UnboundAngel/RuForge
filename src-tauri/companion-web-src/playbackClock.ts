import { useSyncExternalStore } from "react";

// Playback position changes about four times a second. Held in React state at the root it re-rendered every tab on each tick, so only the components that draw it subscribe.
let time = 0;
const listeners = new Set<() => void>();

export function setClock(t: number) {
  if (t === time) return;
  time = t;
  listeners.forEach((l) => l());
}

export function getClock(): number {
  return time;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useClock(): number {
  return useSyncExternalStore(subscribe, getClock);
}

/** Re-renders only when the selected value changes, not on every tick. */
export function useClockSelector<T>(select: (t: number) => T): T {
  return useSyncExternalStore(subscribe, () => select(time));
}

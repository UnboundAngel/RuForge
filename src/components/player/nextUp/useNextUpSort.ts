import { useSyncExternalStore } from "react";
import { isNextUpSort, type NextUpSort } from "./nextUpOrder";

const KEY = "ruforge-next-up-sort";
const listeners = new Set<() => void>();

function read(): NextUpSort {
  try {
    const raw = localStorage.getItem(KEY);
    return isNextUpSort(raw) ? raw : "folder";
  } catch {
    return "folder";
  }
}

let current: NextUpSort = read();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setNextUpSort(next: NextUpSort) {
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  listeners.forEach((l) => l());
}

/** One shared value: PlayerView orders playback by it, the panel edits it. */
export function useNextUpSort(): [NextUpSort, (next: NextUpSort) => void] {
  const sort = useSyncExternalStore(subscribe, () => current);
  return [sort, setNextUpSort];
}

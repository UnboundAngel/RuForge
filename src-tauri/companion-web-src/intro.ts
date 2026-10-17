import { useSyncExternalStore } from "react";
import { hasSeen, markSeen } from "./settings";
import type { CompanionItem } from "./types";

export type IntroId = "save" | "install" | "offline" | "storage";
export type Intro = { id: IntroId; item?: CompanionItem };

let current: Intro | null = null;
const listeners = new Set<() => void>();

function set(next: Intro | null) {
  current = next;
  listeners.forEach((fn) => fn());
}

/** Opens the intro for an event the first time it happens; false when already seen or another is up. */
export function requestIntro(id: IntroId, item?: CompanionItem): boolean {
  if (current || hasSeen(id)) return false;
  set({ id, item });
  return true;
}

/** Opens a sheet on request, even one already seen (the strip and storage links). */
export function openIntro(id: IntroId): void {
  if (!current) set({ id });
}

export function closeIntro() {
  if (!current) return;
  markSeen(current.id);
  set(null);
}

export function useIntro(): Intro | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => current,
  );
}

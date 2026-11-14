import type { MediaFile } from "@/types";

/** A shelf card being added: its cover's rect and where it sat, so the way back can return it there. */
export type AddFly = { src: string; from: DOMRect; file: MediaFile; index: number };

const INCOMING_MS = 2000;

let incoming: { at: number; claimed: boolean; key: string } | null = null;

export function announceIncoming(key: string): void {
  incoming = { at: Date.now(), claimed: false, key };
}

/** Only the row of the video just added claims the flight; rows remounting for other reasons never do. */
export function claimIncoming(key: string): boolean {
  if (!incoming || incoming.claimed || incoming.key !== key || Date.now() - incoming.at > INCOMING_MS) return false;
  incoming.claimed = true;
  return true;
}

/** Rows added from Suggested this session, by row key. Removing one plays the add in reverse. */
export const addedFromSuggested = new Map<string, AddFly>();

/** Row exits that fold the text back into the thumbnail; every other removal stays instant. */
export const reverseExits = new Map<string, { width: number; thumbRight: number }>();

/** Cards that left the shelf for the playlist; their slot closes at once instead of waiting for a swap. */
export const fleeingCards = new Set<string>();

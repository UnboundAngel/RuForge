import { create } from "zustand";

/** A download older than this has been seen or forgotten; flying it in later would be noise. */
const ARRIVAL_TTL_MS = 15 * 60 * 1000;
/** A big batch only flies its newest few; the rest land without holding the rail chip open. */
const MAX_PENDING_ARRIVALS = 6;

export type LibraryArrival = { thumbnail: string | null; title: string | null; at: number };

export const useLibraryArrivals = create<{ arrivals: Record<string, LibraryArrival> }>(() => ({
  arrivals: {},
}));

export function arrivalKey(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleExpiry(arrivals: Record<string, LibraryArrival>): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  const oldest = Math.min(...Object.values(arrivals).map((a) => a.at));
  if (!Number.isFinite(oldest)) return;
  expiryTimer = setTimeout(pruneExpired, Math.max(0, oldest + ARRIVAL_TTL_MS - Date.now()) + 50);
}

function pruneExpired(): void {
  const now = Date.now();
  const arrivals = Object.fromEntries(
    Object.entries(useLibraryArrivals.getState().arrivals).filter(([, a]) => now - a.at < ARRIVAL_TTL_MS),
  );
  useLibraryArrivals.setState({ arrivals });
  scheduleExpiry(arrivals);
}

export function announceLibraryArrival(path: string, thumbnail: string | null, title: string | null): void {
  const now = Date.now();
  const kept = Object.entries(useLibraryArrivals.getState().arrivals)
    .filter(([, a]) => now - a.at < ARRIVAL_TTL_MS)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_PENDING_ARRIVALS - 1);
  const arrivals: Record<string, LibraryArrival> = Object.fromEntries(kept);
  arrivals[arrivalKey(path)] = { thumbnail, title, at: now };
  useLibraryArrivals.setState({ arrivals });
  scheduleExpiry(arrivals);
}

/** Returns the arrival once; the first card to claim it plays the flight. */
export function claimLibraryArrival(path: string): LibraryArrival | null {
  const key = arrivalKey(path);
  const arrival = useLibraryArrivals.getState().arrivals[key];
  if (!arrival) return null;
  const { [key]: _, ...rest } = useLibraryArrivals.getState().arrivals;
  useLibraryArrivals.setState({ arrivals: rest });
  scheduleExpiry(rest);
  return Date.now() - arrival.at < ARRIVAL_TTL_MS ? arrival : null;
}

/** The newest arrival still waiting for its card to come on screen, plus how many are waiting. */
export function newestPendingArrival(
  arrivals: Record<string, LibraryArrival>,
): { arrival: LibraryArrival; count: number } | null {
  const list = Object.values(arrivals);
  if (list.length === 0) return null;
  return { arrival: list.reduce((a, b) => (b.at > a.at ? b : a)), count: list.length };
}

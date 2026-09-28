import { create } from "zustand";
import type { WatchlistSnapshot } from "./types";

type WatchlistState = {
  /** Mirror of Rust's watchlist.json; null until the first `get_watchlist` lands. */
  snapshot: WatchlistSnapshot | null;
  /** Uploads that arrived while main was unfocused, shown together on the desktop island. */
  islandBatchIds: string[];
  islandBatchAt: number;
};

export const useWatchlistStore = create<WatchlistState>(() => ({
  snapshot: null,
  islandBatchIds: [],
  islandBatchAt: 0,
}));

export function setWatchlistSnapshot(snapshot: WatchlistSnapshot): void {
  useWatchlistStore.setState({ snapshot });
}

import {
  ISLAND_WATCHLIST_HOLD_GRACE_MS,
  islandWatchlistLapseAt,
} from "./islandWatchlist";

export type IslandWatchlistHold = {
  /** Feed to buildIslandWatchlist: Infinity while held, a grace deadline after release. */
  keepUntil: () => number;
  /** Runs onChange at once so a release or press reflects immediately. */
  setHeld: (held: boolean) => void;
  /** Re-runs onChange at the next moment the pill's visibility changes on its own. */
  schedule: (batchAt: number, now: number, active: boolean) => void;
  dispose: () => void;
};

export function createIslandWatchlistHold(onChange: () => void): IslandWatchlistHold {
  let keepUntil = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerAt: number | null = null;

  const clear = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    timerAt = null;
  };

  return {
    keepUntil: () => keepUntil,
    setHeld: (held) => {
      keepUntil = held ? Infinity : Date.now() + ISLAND_WATCHLIST_HOLD_GRACE_MS;
      onChange();
    },
    schedule: (batchAt, now, active) => {
      const at = active ? islandWatchlistLapseAt(batchAt, now, keepUntil) : null;
      if (at === timerAt) return;
      clear();
      if (at == null) return;
      timerAt = at;
      timer = setTimeout(() => {
        timer = null;
        timerAt = null;
        onChange();
      }, at - now + 50);
    },
    dispose: clear,
  };
}

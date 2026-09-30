import { useMemo } from "react";
import type { NotificationPrefs } from "@/notifications/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { DEFAULT_CHECK_INTERVAL_MIN } from "@/watchlist/watchlistSettings";
import { useWatchlistStore } from "@/watchlist/watchlistStore";

/** Main window only: the overlay webview gets these through its pushed state. */
export function useNotificationPrefs(): NotificationPrefs {
  const alerts = useRuforgeStore((s) => s.settings.watchlistAlerts !== false);
  const checkIntervalMin = useWatchlistStore((s) => s.snapshot?.checkIntervalMin ?? DEFAULT_CHECK_INTERVAL_MIN);
  return useMemo(() => ({ alerts, checkIntervalMin }), [alerts, checkIntervalMin]);
}

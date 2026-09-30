import {
  setNotificationFilter,
  setNotificationPopoverOpen,
  setNotificationTab,
} from "@/notifications/notificationCenterStore";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { setCheckInterval } from "./watchlistActions";

export const CHECK_INTERVAL_OPTIONS = [
  { label: "Every 15 minutes", short: "15 min", minutes: 15 },
  { label: "Every 30 minutes", short: "30 min", minutes: 30 },
  { label: "Every hour", short: "1 hour", minutes: 60 },
  { label: "Every 3 hours", short: "3 hours", minutes: 180 },
] as const;

export const DEFAULT_CHECK_INTERVAL_MIN = 30;

/** Rust accepts 15 to 360; a hand-edited watchlist.json can hold a value that is not a preset. */
export function checkIntervalLabel(minutes: number): string {
  const preset = CHECK_INTERVAL_OPTIONS.find((o) => o.minutes === minutes);
  if (preset) return preset.label;
  return minutes % 60 === 0 ? `Every ${minutes / 60} hours` : `Every ${minutes} minutes`;
}

export function checkIntervalFromLabel(label: string): number | null {
  return CHECK_INTERVAL_OPTIONS.find((o) => o.label === label)?.minutes ?? null;
}

export function setWatchlistAlerts(enabled: boolean): void {
  void useRuforgeStore.getState().updateSetting("watchlistAlerts", enabled);
}

/** Only presets are accepted here, so a forged overlay action cannot push an odd value to Rust. */
export function changeCheckInterval(minutes: number): void {
  if (!CHECK_INTERVAL_OPTIONS.some((o) => o.minutes === minutes)) return;
  setCheckInterval(minutes).catch(() => useRuforgeStore.getState().notify("Could not change the check interval."));
}

/** The Notifications section lives on the Downloads tab. */
export function openNotificationSettings(): void {
  setNotificationPopoverOpen(false);
  const s = useRuforgeStore.getState();
  s.setSettingsTab("downloads");
  s.openSettings();
}

export function openChannelsManager(): void {
  useRuforgeStore.getState().closeSettings();
  // The popover closes on surface changes and picks its host (in-page or above YouTube) from the
  // surface App activates after Settings closes, so open it once that commit has landed.
  setTimeout(() => {
    setNotificationTab("channels");
    setNotificationFilter("all");
    setNotificationPopoverOpen(true);
  }, 0);
}

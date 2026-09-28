import {
  setNotificationFilter,
  setNotificationPopoverOpen,
  setNotificationTab,
} from "@/notifications/notificationCenterStore";
import { useRuforgeStore } from "@/store/ruforgeStore";

export const CHECK_INTERVAL_OPTIONS = [
  { label: "Every 15 minutes", minutes: 15 },
  { label: "Every 30 minutes", minutes: 30 },
  { label: "Every hour", minutes: 60 },
  { label: "Every 3 hours", minutes: 180 },
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

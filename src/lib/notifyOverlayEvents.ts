import type {
  NotificationCenterFilter,
  NotificationCenterTab,
  NotificationItem,
  NotificationPrefs,
} from "@/notifications/types";
import type { NavMode } from "@/store/types";
import type { ChannelsUiState, WatchedChannel } from "@/watchlist/types";

/** Child webview in `main` that paints the notification popover above the YouTube webviews. */
export const NOTIFY_OVERLAY_LABEL = "notify-overlay";
/** `?rfWindow=` value; inside a child webview `getCurrentWindow().label` is still `main`. */
export const NOTIFY_OVERLAY_QUERY = "notify-overlay";

export const NOTIFY_OVERLAY_STATE_EVENT = "notify-overlay-state";
export const NOTIFY_OVERLAY_ACTION_EVENT = "notify-overlay-action";
export const NOTIFY_OVERLAY_READY_EVENT = "notify-overlay-ready";
export const NOTIFY_OVERLAY_SIZE_EVENT = "notify-overlay-size";
export const NOTIFY_OVERLAY_CLOSE_EVENT = "notify-overlay-close";

export const NOTIFY_OVERLAY_PANEL_WIDTH = 480;
/** Transparent gutter so the panel's float shadow is not clipped at the webview edge. */
export const NOTIFY_OVERLAY_SHADOW_PAD = 16;

export type NotifyOverlayState = {
  open: boolean;
  navMode: NavMode;
  accent: string;
  maxHeight: number;
  items: NotificationItem[];
  channels: WatchedChannel[];
  channelsUi: ChannelsUiState;
  tab: NotificationCenterTab;
  filter: NotificationCenterFilter;
  prefs: NotificationPrefs;
};

export type NotifyOverlayAction =
  | { type: "action"; itemId: string; action: NotificationItem["actions"][number] }
  | { type: "markRead"; itemId: string }
  | { type: "markAllRead" }
  | { type: "tab"; tab: NotificationCenterTab }
  | { type: "filter"; filter: NotificationCenterFilter }
  | { type: "followInput"; input: string }
  | { type: "autoDownload"; channelId: string; enabled: boolean }
  | { type: "unfollow"; channelId: string }
  | { type: "checkNow" }
  | { type: "openSettings" }
  | { type: "setAlerts"; enabled: boolean }
  | { type: "setCheckInterval"; minutes: number };

export type NotifyOverlaySize = { height: number };

/** `blur` means focus already moved to what the user clicked; the others keep it in the overlay. */
export type NotifyOverlayClose = { reason: "blur" | "escape" | "outside" };

export function isNotifyOverlayDocument(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("rfWindow") === NOTIFY_OVERLAY_QUERY;
  } catch {
    return false;
  }
}

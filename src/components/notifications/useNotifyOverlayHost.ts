import { useEffect, useState } from "react";
import type { NotifyOverlayAction } from "@/lib/notifyOverlayEvents";
import {
  hideNotifyOverlay,
  moveNotifyOverlay,
  pushNotifyOverlayState,
  setNotifyOverlayHandlers,
  showNotifyOverlay,
  type NotifyOverlayAnchor,
} from "@/lib/notifyOverlayHost";
import { setNotificationFilter, setNotificationTab } from "@/notifications/notificationCenterStore";
import {
  closeNotificationPopover,
  markEveryNotificationRead,
  markOneNotificationRead,
  runNotificationAction,
} from "@/notifications/popoverActions";
import { allItems } from "@/notifications/selectors";
import type { NotificationCenterFilter, NotificationCenterTab, NotificationItem } from "@/notifications/types";
import type { NavMode } from "@/store/types";
import type { WatchedChannel } from "@/watchlist/types";

const PANEL_MAX_HEIGHT = 560;
const PANEL_BOTTOM_CLEARANCE = 72;

export type NotifyOverlayView = {
  navMode: NavMode;
  items: NotificationItem[];
  channels: WatchedChannel[];
  tab: NotificationCenterTab;
  filter: NotificationCenterFilter;
};

function panelMaxHeight(): number {
  return Math.max(160, Math.min(PANEL_MAX_HEIGHT, window.innerHeight - PANEL_BOTTOM_CLEARANCE));
}

function readAccent(): string {
  const el = document.querySelector('[data-music-mode="true"]') ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue("--accent").trim();
}

/** Look items up in main so the overlay can only act on rows that really exist. */
function applyOverlayAction(action: NotifyOverlayAction): void {
  switch (action.type) {
    case "action": {
      const item = allItems().find((i) => i.id === action.itemId);
      if (item?.actions.includes(action.action)) void runNotificationAction(item, action.action);
      return;
    }
    case "markRead": {
      const item = allItems().find((i) => i.id === action.itemId);
      if (item) markOneNotificationRead(item);
      return;
    }
    case "markAllRead":
      markEveryNotificationRead();
      return;
    case "tab":
      setNotificationTab(action.tab);
      return;
    case "filter":
      setNotificationFilter(action.filter);
      return;
  }
}

/**
 * Host B driver. Returns true when the overlay webview could not be created, so the caller
 * renders the in-page fallback instead.
 */
export function useNotifyOverlayHost(
  wanted: boolean,
  readAnchor: () => NotifyOverlayAnchor | null,
  view: NotifyOverlayView,
): boolean {
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setNotifyOverlayHandlers({ onAction: applyOverlayAction, onClose: closeNotificationPopover });
    return () => setNotifyOverlayHandlers(null);
  }, []);

  const { navMode, items, channels, tab, filter } = view;
  useEffect(() => {
    if (!wanted) return;
    pushNotifyOverlayState({
      open: true,
      navMode,
      accent: readAccent(),
      maxHeight: panelMaxHeight(),
      items,
      channels,
      tab,
      filter,
    });
  }, [wanted, navMode, items, channels, tab, filter]);

  useEffect(() => {
    if (!wanted) {
      setFallback(false);
      return;
    }
    let cancelled = false;
    const anchor = readAnchor();
    if (!anchor) return;
    void showNotifyOverlay(anchor, panelMaxHeight()).then((result) => {
      if (!cancelled && result === "unavailable") setFallback(true);
    });
    const onResize = () => {
      const next = readAnchor();
      if (next) void moveNotifyOverlay(next);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      void hideNotifyOverlay(true);
    };
  }, [wanted, readAnchor]);

  return fallback;
}

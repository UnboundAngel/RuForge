import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { debugLog } from "@/debug/debugLog";
import { MUSIC_EXPLORE_WEBVIEW_LABEL } from "@/explorerProfileScript";
import { EMBEDDED_EXPLORER_WEBVIEW_LABEL } from "@/explorerWebviewLifecycle";
import { activeRadialNavSurface } from "@/lib/radialNavOverlayHost";
import { REDUCED_PANEL_MOTION, notifyPanelMotion } from "@/lib/overlayMotion";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import {
  setExplorerCoveredByPopover,
  setNotificationTab,
  useNotificationCenterStore,
} from "@/notifications/notificationCenterStore";
import {
  closeNotificationPopover,
  markEveryNotificationRead,
  markOneNotificationRead,
  runNotificationAction,
} from "@/notifications/popoverActions";
import { useNotificationItems } from "@/notifications/selectors";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { clearChannelFollowMessage, useChannelsUiStore } from "@/watchlist/channelManage";
import { openNotificationSettings } from "@/watchlist/watchlistSettings";
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import type { WatchedChannel } from "@/watchlist/types";
import { bellAnchorRect, isInsideBell } from "./bellAnchor";
import { mainChannelHandlers, mainPrefsHandlers } from "./mainPanelHandlers";
import { NotificationCenterPanel } from "./NotificationCenterPanel";
import { useNotificationPrefs } from "./useNotificationPrefs";
import { useNotifyOverlayHost } from "./useNotifyOverlayHost";

const PANEL_GAP_PX = 6;
const NO_CHANNELS: WatchedChannel[] = [];

type Anchor = { top: number; right: number };

function readAnchor(): Anchor | null {
  const rect = bellAnchorRect();
  if (!rect) return null;
  return { top: rect.bottom + PANEL_GAP_PX, right: Math.max(8, window.innerWidth - rect.right) };
}

/**
 * Host A portals the panel under the bell. YouTube child webviews paint over DOM, so on those
 * surfaces Host B (overlay webview) takes over and Host A only returns as the fallback.
 */
export function NotificationCenterPopover() {
  const open = useNotificationCenterStore((s) => s.popoverOpen);
  const tab = useNotificationCenterStore((s) => s.tab);
  const filter = useNotificationCenterStore((s) => s.filter);
  const items = useNotificationItems();
  const channels = useWatchlistStore((s) => s.snapshot?.channels ?? NO_CHANNELS);
  const channelsUi = useChannelsUiStore();
  const navMode = useRuforgeStore((s) => s.navMode);
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const settingsOpen = useRuforgeStore((s) => s.settingsOpen);
  const downloaderOpen = useRuforgeStore((s) => s.downloaderOpen);
  const inIsland = useRuforgeStore((s) => s.settings.notificationsInIsland === true);
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const surfaceKey = `${activeTab}|${navMode}|${settingsOpen}|${downloaderOpen}`;
  const prevSurfaceKey = useRef(surfaceKey);
  useEffect(() => {
    if (prevSurfaceKey.current === surfaceKey) return;
    prevSurfaceKey.current = surfaceKey;
    closeNotificationPopover();
  }, [surfaceKey]);

  useEffect(() => {
    if (open) return;
    clearChannelFollowMessage();
    if (useNotificationCenterStore.getState().tab === "settings") setNotificationTab("feed");
  }, [open]);

  const prefs = useNotificationPrefs();
  const youtubeSurface = open ? activeRadialNavSurface() : null;
  const overlayFallback = useNotifyOverlayHost(youtubeSurface != null && !inIsland, readAnchor, {
    navMode,
    items,
    channels,
    channelsUi,
    tab,
    filter,
    prefs,
  });
  // The island panel is page DOM too, so it needs the same Explorer hide as the in-page fallback.
  const fallbackSurface = overlayFallback || inIsland ? youtubeSurface : null;

  useEffect(() => {
    setExplorerCoveredByPopover(fallbackSurface === EMBEDDED_EXPLORER_WEBVIEW_LABEL);
    if (fallbackSurface === MUSIC_EXPLORE_WEBVIEW_LABEL) {
      debugLog("music.webview", "warn", "notify overlay unavailable; popover renders under Music Explore");
    }
  }, [fallbackSurface]);
  useEffect(() => () => setExplorerCoveredByPopover(false), []);

  const hostAOpen = open && !inIsland && (youtubeSurface == null || overlayFallback);

  useLayoutEffect(() => {
    if (!hostAOpen) return;
    const update = () => setAnchor(readAnchor());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [hostAOpen]);

  useEffect(() => {
    if (!hostAOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node) || isInsideBell(e.target)) return;
      closeNotificationPopover();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNotificationPopover();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [hostAOpen]);

  const onAction = useCallback((item: NotificationItem, action: NotificationActionId) => {
    void runNotificationAction(item, action);
  }, []);

  const shownAnchor = hostAOpen ? anchor : null;
  const panelMotion = reduceMotion ? REDUCED_PANEL_MOTION : notifyPanelMotion;

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {shownAnchor ? (
        <motion.div
          key="notification-center"
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          data-music-mode={navMode === "music" ? "true" : undefined}
          className={`fixed ${OVERLAY_Z_CLASS.menus} flex max-h-[min(640px,calc(100vh-72px))] w-[480px] origin-top-right flex-col overflow-hidden rounded-[20px] bg-[color:var(--rf-popover-bg)] shadow-[0_18px_48px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]`}
          style={{ top: shownAnchor.top, right: shownAnchor.right }}
          {...panelMotion}
        >
          <NotificationCenterPanel
            items={items}
            channels={channels}
            channelsUi={channelsUi}
            channelHandlers={mainChannelHandlers}
            prefs={prefs}
            prefsHandlers={mainPrefsHandlers}
            tab={tab}
            onAction={onAction}
            onMarkRead={markOneNotificationRead}
            onMarkAllRead={markEveryNotificationRead}
            onTab={setNotificationTab}
            onOpenSettings={openNotificationSettings}
            onClose={closeNotificationPopover}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

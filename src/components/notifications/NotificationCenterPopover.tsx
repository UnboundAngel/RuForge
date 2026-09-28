import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { debugLog } from "@/debug/debugLog";
import { MUSIC_EXPLORE_WEBVIEW_LABEL } from "@/explorerProfileScript";
import { EMBEDDED_EXPLORER_WEBVIEW_LABEL } from "@/explorerWebviewLifecycle";
import { activeRadialNavSurface } from "@/lib/radialNavOverlayHost";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import {
  setExplorerCoveredByPopover,
  setNotificationFilter,
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
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import type { WatchedChannel } from "@/watchlist/types";
import { bellAnchorRect, isInsideBell } from "./bellAnchor";
import { NotificationCenterPanel } from "./NotificationCenterPanel";
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
  const navMode = useRuforgeStore((s) => s.navMode);
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const settingsOpen = useRuforgeStore((s) => s.settingsOpen);
  const downloaderOpen = useRuforgeStore((s) => s.downloaderOpen);
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

  const youtubeSurface = open ? activeRadialNavSurface() : null;
  const overlayFallback = useNotifyOverlayHost(youtubeSurface != null, readAnchor, {
    navMode,
    items,
    channels,
    tab,
    filter,
  });
  const fallbackSurface = overlayFallback ? youtubeSurface : null;

  useEffect(() => {
    setExplorerCoveredByPopover(fallbackSurface === EMBEDDED_EXPLORER_WEBVIEW_LABEL);
    if (fallbackSurface === MUSIC_EXPLORE_WEBVIEW_LABEL) {
      debugLog("music.webview", "warn", "notify overlay unavailable; popover renders under Music Explore");
    }
  }, [fallbackSurface]);
  useEffect(() => () => setExplorerCoveredByPopover(false), []);

  const hostAOpen = open && (youtubeSurface == null || overlayFallback);

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
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.18, ease: OVERLAY_EASE };

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
          className={`fixed ${OVERLAY_Z_CLASS.menus} flex max-h-[min(560px,calc(100vh-72px))] w-[392px] origin-top-right flex-col overflow-hidden rounded-[20px] bg-[color:var(--rf-popover-bg)] shadow-[0_18px_48px_rgba(0,0,0,0.5)]`}
          style={{ top: shownAnchor.top, right: shownAnchor.right }}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={transition}
        >
          <NotificationCenterPanel
            items={items}
            channels={channels}
            tab={tab}
            filter={filter}
            onAction={onAction}
            onMarkRead={markOneNotificationRead}
            onMarkAllRead={markEveryNotificationRead}
            onTab={setNotificationTab}
            onFilter={setNotificationFilter}
            onClose={closeNotificationPopover}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

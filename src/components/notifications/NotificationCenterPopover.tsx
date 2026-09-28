import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { activeRadialNavSurface } from "@/lib/radialNavOverlayHost";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import {
  setNotificationFilter,
  setNotificationPopoverOpen,
  setNotificationTab,
  useNotificationCenterStore,
} from "@/notifications/notificationCenterStore";
import { actionClosesPopover } from "@/notifications/panelModel";
import { markAllNotificationsRead, markNotificationsRead, notificationSource } from "@/notifications/registry";
import { useNotificationItems } from "@/notifications/selectors";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useWatchlistStore } from "@/watchlist/watchlistStore";
import type { WatchedChannel } from "@/watchlist/types";
import { bellAnchorRect, isInsideBell } from "./bellAnchor";
import { NotificationCenterPanel } from "./NotificationCenterPanel";

const PANEL_GAP_PX = 6;
const NO_CHANNELS: WatchedChannel[] = [];

type Anchor = { top: number; right: number };

function readAnchor(): Anchor | null {
  const rect = bellAnchorRect();
  if (!rect) return null;
  return { top: rect.bottom + PANEL_GAP_PX, right: Math.max(8, window.innerWidth - rect.right) };
}

async function runNotificationAction(item: NotificationItem, action: NotificationActionId): Promise<void> {
  const source = notificationSource(item.source);
  if (!source) return;
  if (actionClosesPopover(action)) setNotificationPopoverOpen(false);
  try {
    await source.runAction(item, action);
    await markNotificationsRead([item]);
  } catch (e) {
    console.error(e);
  }
}

function markOneRead(item: NotificationItem): void {
  void markNotificationsRead([item]).catch(console.error);
}

function markAllRead(): void {
  void markAllNotificationsRead().catch(console.error);
}

function closePopover(): void {
  setNotificationPopoverOpen(false);
}

/** Host A: the panel portaled under the bell. YouTube child webviews paint over DOM, so it stands down there. */
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
    closePopover();
  }, [surfaceKey]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setAnchor(readAnchor());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node) || isInsideBell(e.target)) return;
      closePopover();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onAction = useCallback((item: NotificationItem, action: NotificationActionId) => {
    void runNotificationAction(item, action);
  }, []);

  // Phase 7 renders the panel in an overlay webview for these surfaces; until then the bell only toggles state.
  const youtubeSurfaceActive = open && activeRadialNavSurface() != null;
  const shownAnchor = open && !youtubeSurfaceActive ? anchor : null;
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
            onMarkRead={markOneRead}
            onMarkAllRead={markAllRead}
            onTab={setNotificationTab}
            onFilter={setNotificationFilter}
            onClose={closePopover}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

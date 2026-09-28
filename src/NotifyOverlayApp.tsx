import { emitTo, listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import type { ChannelHandlers } from "@/components/notifications/channels/ChannelsPanel";
import { NotificationCenterPanel } from "@/components/notifications/NotificationCenterPanel";
import { RfScrollbarHost } from "@/components/ui/RfScrollbarHost";
import { AppTooltipLayer } from "@/components/ui/TooltipLayer";
import {
  NOTIFY_OVERLAY_ACTION_EVENT,
  NOTIFY_OVERLAY_CLOSE_EVENT,
  NOTIFY_OVERLAY_READY_EVENT,
  NOTIFY_OVERLAY_SHADOW_PAD,
  NOTIFY_OVERLAY_SIZE_EVENT,
  NOTIFY_OVERLAY_STATE_EVENT,
  type NotifyOverlayAction,
  type NotifyOverlayClose,
  type NotifyOverlaySize,
  type NotifyOverlayState,
} from "@/lib/notifyOverlayEvents";
import { OVERLAY_EASE } from "@/lib/overlayMotion";
import type { NotificationActionId, NotificationItem } from "@/notifications/types";

const MAIN = "main";

function send(action: NotifyOverlayAction): void {
  void emitTo(MAIN, NOTIFY_OVERLAY_ACTION_EVENT, action);
}

function close(reason: NotifyOverlayClose["reason"]): void {
  void emitTo(MAIN, NOTIFY_OVERLAY_CLOSE_EVENT, { reason } satisfies NotifyOverlayClose);
}

const channelHandlers: ChannelHandlers = {
  onFollowInput: (input) => send({ type: "followInput", input }),
  onAutoDownload: (channelId, enabled) => send({ type: "autoDownload", channelId, enabled }),
  onUnfollow: (channelId) => send({ type: "unfollow", channelId }),
  onCheckNow: () => send({ type: "checkNow" }),
};

/** Host B: the notification panel in a transparent child webview stacked above the YouTube webviews. */
export default function NotifyOverlayApp() {
  const [state, setState] = useState<NotifyOverlayState | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    document.documentElement.classList.add("ruforge-overlay-root");
    return () => document.documentElement.classList.remove("ruforge-overlay-root");
  }, []);

  useEffect(() => {
    const unlisten = listen<NotifyOverlayState>(NOTIFY_OVERLAY_STATE_EVENT, (e) => setState(e.payload));
    void unlisten.then(() => emitTo(MAIN, NOTIFY_OVERLAY_READY_EVENT));
    return () => void unlisten.then((off) => off());
  }, []);

  useEffect(() => {
    const onBlur = () => close("blur");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("escape");
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // A transparent webview still eats clicks, so main sizes it to the panel's real height.
  useEffect(() => {
    if (!panelEl) return;
    const report = () =>
      void emitTo(MAIN, NOTIFY_OVERLAY_SIZE_EVENT, { height: panelEl.offsetHeight } satisfies NotifyOverlaySize);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(panelEl);
    return () => observer.disconnect();
  }, [panelEl]);

  const onAction = useCallback(
    (item: NotificationItem, action: NotificationActionId) => send({ type: "action", itemId: item.id, action }),
    [],
  );
  const onMarkRead = useCallback((item: NotificationItem) => send({ type: "markRead", itemId: item.id }), []);

  const transition = reduceMotion ? { duration: 0 } : { duration: 0.18, ease: OVERLAY_EASE };
  const panelStyle = state
    ? ({ "--accent": state.accent, maxHeight: state.maxHeight } as CSSProperties)
    : undefined;

  return (
    <div
      className="h-screen w-screen"
      style={{ paddingLeft: NOTIFY_OVERLAY_SHADOW_PAD, paddingRight: NOTIFY_OVERLAY_SHADOW_PAD }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close("outside");
      }}
    >
      <RfScrollbarHost />
      <AppTooltipLayer />
      <AnimatePresence>
        {state?.open ? (
          <motion.div
            key="notification-center"
            ref={setPanelEl}
            role="dialog"
            aria-label="Notifications"
            data-music-mode={state.navMode === "music" ? "true" : undefined}
            className="flex w-full origin-top-right flex-col overflow-hidden rounded-[20px] bg-[color:var(--rf-popover-bg)] shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
            style={panelStyle}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={transition}
          >
            <NotificationCenterPanel
              items={state.items}
              channels={state.channels}
              channelsUi={state.channelsUi}
              channelHandlers={channelHandlers}
              tab={state.tab}
              filter={state.filter}
              onAction={onAction}
              onMarkRead={onMarkRead}
              onMarkAllRead={() => send({ type: "markAllRead" })}
              onTab={(tab) => send({ type: "tab", tab })}
              onFilter={(filter) => send({ type: "filter", filter })}
              onClose={() => close("escape")}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";

import {
  NotificationCenterPanel,
  type NotificationCenterPanelProps,
} from "@/components/notifications/NotificationCenterPanel";

const WIDTH = 400;
const MAX_HEIGHT = 560;
const MIN_HEIGHT = 120;
const VIEWPORT_CLEARANCE = 72;

function maxHeight(): number {
  const viewport = typeof window === "undefined" ? MAX_HEIGHT : window.innerHeight - VIEWPORT_CLEARANCE;
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, viewport));
}

export function islandNotificationsDims(measured: number | null) {
  const height = Math.max(MIN_HEIGHT, Math.min(maxHeight(), measured ?? 220));
  return { width: WIDTH, height, borderRadius: 24 };
}

export function IslandNotificationsContent({
  panel,
  onHeight,
}: {
  panel: NotificationCenterPanelProps;
  onHeight: (height: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const report = () => onHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeight]);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: reduceMotion ? { duration: 0 } : { duration: 0.2, delay: 0.1 } }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.95, transition: { duration: reduceMotion ? 0 : 0.15 } }}
      role="dialog"
      aria-label="Notifications"
      className="pointer-events-auto absolute inset-0 cursor-default"
      style={{ originY: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Sized by content, not by the shell, so the shell can spring to the reported height. */}
      <div ref={bodyRef} className="absolute inset-x-0 top-0 flex flex-col" style={{ maxHeight: maxHeight() }}>
        <NotificationCenterPanel {...panel} compact />
      </div>
    </motion.div>
  );
}

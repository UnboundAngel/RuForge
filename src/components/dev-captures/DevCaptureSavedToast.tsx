import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { humanizeDevCaptureLabel } from "@/lib/devCaptureScreenLabel";
import type { DevCaptureEntry } from "@/lib/devCapturesTypes";
import { toastThumbSize } from "./devCaptureToastLayout";

const AUTO_DISMISS_MS = 6000;

export type DevCaptureToastItem = {
  id: string;
  entry: DevCaptureEntry;
  contextLabel: string;
  width: number;
  height: number;
};

export function DevCaptureSavedToast({
  item,
  onOpen,
  onDismiss,
  skipEntrance,
}: {
  item: DevCaptureToastItem;
  onOpen: (entry: DevCaptureEntry) => void;
  onDismiss: (id: string) => void;
  skipEntrance?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { w, h } = toastThumbSize(item.width, item.height);
  const label = humanizeDevCaptureLabel(item.contextLabel);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
  }, [clearTimer, item.id, onDismiss]);

  useEffect(() => {
    if (!hover) armTimer();
    return clearTimer;
  }, [hover, armTimer, clearTimer]);

  return (
    <motion.article
      layout
      initial={skipEntrance ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      data-dev-capture-toast
      className="rf-notify-card pointer-events-auto flex w-max max-w-[calc(100vw-2rem)] cursor-pointer items-center gap-2 rounded-lg border-2 border-white/25 px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      onMouseEnter={() => {
        setHover(true);
        clearTimer();
      }}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(item.entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item.entry);
        }
      }}
    >
      <div
        className="shrink-0 overflow-hidden rounded-md"
        style={{ width: w, height: h }}
      >
        <img
          src={`${convertFileSrc(item.entry.path)}?v=${item.entry.modifiedMs}`}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <span className="shrink-0 text-xs font-semibold leading-none text-stone-50 whitespace-nowrap">
        {label} saved
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
        className="shrink-0 rounded p-0.5 text-stone-500 transition-colors hover:text-stone-300"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </motion.article>
  );
}

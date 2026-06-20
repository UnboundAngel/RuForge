import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanizeDevCaptureLabel } from "@/lib/devCaptureScreenLabel";
import type { DevCaptureToastItem } from "./DevCaptureSavedToast";
import { measureToastMorphTargets, TOAST_CARD_GAP, TOAST_CARD_PAD, toastThumbSize } from "./devCaptureToastLayout";

const FLY_DURATION = 0.68;
const EXPAND_DURATION = 0.34;
const HOLD_MS = 160;
const EASE = [0.16, 1, 0.3, 1] as const;

export type DevCaptureToastMorphPayload = {
  previewSrc: string;
  item: DevCaptureToastItem;
  from: DOMRect;
  stackEl: HTMLElement | null;
};

export function DevCaptureToastMorph({
  payload,
  onDone,
}: {
  payload: DevCaptureToastMorphPayload;
  onDone: () => void;
}) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [phase, setPhase] = useState<"fly" | "expand">("fly");
  const [imageReady, setImageReady] = useState(false);
  const [run, setRun] = useState(false);
  const finishedRef = useRef(false);

  const { previewSrc, item, from, stackEl } = payload;
  const thumb = toastThumbSize(item.width, item.height);
  const { card, thumb: thumbTarget } = measureToastMorphTargets(
    stackEl,
    item.width,
    item.height,
    item.contextLabel,
  );
  const label = humanizeDevCaptureLabel(item.contextLabel);

  const iconPx = Math.max(from.width, from.height, 28);
  const startScale = iconPx / Math.max(thumb.w, thumb.h, 1);
  const startCx = from.left + from.width / 2;
  const startCy = from.top + from.height / 2;
  const startLeft = startCx - thumb.w / 2;
  const startTop = startCy - thumb.h / 2;

  useEffect(() => {
    if (reduced) onDone();
  }, [reduced, onDone]);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const img = new Image();
    img.src = previewSrc;
    void (async () => {
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        } else {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("preview load failed"));
          });
        }
      } catch {
        /* fly with best effort if decode fails */
      }
      if (!cancelled) setImageReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewSrc, reduced]);

  useEffect(() => {
    if (!imageReady || reduced || run) return;
    const hold = window.setTimeout(() => setRun(true), HOLD_MS);
    return () => clearTimeout(hold);
  }, [imageReady, reduced, run]);

  if (reduced) return null;

  const expanding = run && phase === "expand";
  const flying = run && phase === "fly";
  const atSource = !run;

  return createPortal(
    <motion.article
      className={cn(
        "rf-notify-card pointer-events-none fixed z-[9999] flex items-center overflow-hidden border-2 border-white/25 shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
        !imageReady && "ring-1 ring-white/30",
      )}
      style={{ transformOrigin: "left center" }}
      initial={{
        left: startLeft,
        top: startTop,
        width: thumb.w,
        height: thumb.h,
        borderRadius: 8,
        scale: startScale,
        padding: 0,
        gap: 0,
        opacity: 0.92,
      }}
      animate={
        expanding
          ? {
              left: card.left,
              top: card.top,
              width: card.width,
              height: card.height,
              borderRadius: 10,
              scale: 1,
              padding: TOAST_CARD_PAD,
              gap: TOAST_CARD_GAP,
              opacity: 1,
            }
          : flying
            ? {
                left: thumbTarget.left,
                top: thumbTarget.top,
                width: thumb.w,
                height: thumb.h,
                borderRadius: 8,
                scale: 1,
                padding: 0,
                gap: 0,
                opacity: 1,
              }
            : {
                left: startLeft,
                top: startTop,
                width: thumb.w,
                height: thumb.h,
                borderRadius: 8,
                scale: atSource && imageReady ? 1 : startScale,
                padding: 0,
                gap: 0,
                opacity: imageReady ? 1 : 0.85,
              }
      }
      transition={{
        left: { duration: expanding ? EXPAND_DURATION : FLY_DURATION, ease: EASE },
        top: { duration: expanding ? EXPAND_DURATION : FLY_DURATION, ease: EASE },
        width: { duration: EXPAND_DURATION, ease: EASE },
        height: { duration: EXPAND_DURATION, ease: EASE },
        borderRadius: { duration: EXPAND_DURATION, ease: EASE },
        scale: { duration: atSource ? 0.22 : FLY_DURATION, ease: EASE },
        opacity: { duration: 0.18, ease: EASE },
        padding: { duration: EXPAND_DURATION, ease: EASE },
        gap: { duration: EXPAND_DURATION, ease: EASE },
      }}
      onAnimationComplete={() => {
        if (!run || finishedRef.current) return;
        if (phase === "fly") {
          setPhase("expand");
          return;
        }
        finishedRef.current = true;
        onDone();
      }}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-md bg-[#1D1613]",
          !expanding && "border border-white/20 ring-2 ring-white/25",
        )}
        style={{ width: thumb.w, height: thumb.h }}
      >
        <img
          src={previewSrc}
          alt=""
          draggable={false}
          className={cn(
            "block h-full w-full object-cover transition-opacity duration-150",
            imageReady ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
      <motion.span
        className="shrink-0 overflow-hidden text-xs font-semibold leading-none text-stone-50 whitespace-nowrap"
        initial={{ opacity: 0, maxWidth: 0 }}
        animate={
          expanding
            ? { opacity: 1, maxWidth: card.width - thumb.w - TOAST_CARD_GAP * 2 - 36 }
            : { opacity: 0, maxWidth: 0 }
        }
        transition={{ duration: EXPAND_DURATION, ease: EASE, delay: expanding ? 0.05 : 0 }}
      >
        {label} saved
      </motion.span>
      <motion.span
        className="shrink-0 overflow-hidden text-stone-500"
        initial={{ opacity: 0, width: 0 }}
        animate={expanding ? { opacity: 1, width: 18 } : { opacity: 0, width: 0 }}
        transition={{ duration: EXPAND_DURATION, ease: EASE, delay: expanding ? 0.08 : 0 }}
        aria-hidden
      >
        <X size={14} />
      </motion.span>
    </motion.article>,
    document.body,
  );
}

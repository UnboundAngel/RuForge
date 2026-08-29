import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { Download } from "lucide-react";
import { OVERLAY_Z_CLASS } from "../../lib/overlayZIndex";

const FLY_MS = 0.52;
const EASE = [0.16, 1, 0.3, 1] as const;
const LAND_SIZE = 32;

export type DownloaderCloseMorphPayload = {
  thumbnail: string | null;
  from: DOMRect;
  to: DOMRect;
};

export function DownloaderCloseMorph({
  payload,
  onDone,
}: {
  payload: DownloaderCloseMorphPayload;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      onDone();
      return;
    }
    const kick = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRun(true));
    });
    return () => cancelAnimationFrame(kick);
  }, [reduceMotion, onDone]);

  if (reduceMotion) return null;

  const { thumbnail, from, to } = payload;
  const startLeft = from.left + from.width / 2 - LAND_SIZE / 2;
  const startTop = from.top + from.height / 2 - LAND_SIZE / 2;
  const endLeft = to.left + to.width / 2 - LAND_SIZE / 2;
  const endTop = to.top + to.height / 2 - LAND_SIZE / 2;
  const startScale = Math.max(from.width, from.height) / LAND_SIZE;

  return createPortal(
    <motion.div
      className={`pointer-events-none fixed overflow-hidden rounded-full bg-[#1D1613] shadow-[0_8px_24px_rgba(0,0,0,0.4)] ${OVERLAY_Z_CLASS.menus}`}
      style={{ width: LAND_SIZE, height: LAND_SIZE }}
      initial={{
        left: startLeft,
        top: startTop,
        scale: Math.min(Math.max(startScale, 1.2), 8),
        opacity: 0.95,
        borderRadius: 20,
      }}
      animate={
        run
          ? {
              left: endLeft,
              top: endTop,
              scale: 1,
              opacity: 1,
              borderRadius: 999,
            }
          : {
              left: startLeft,
              top: startTop,
              scale: Math.min(Math.max(startScale, 1.2), 8),
              opacity: 0.95,
              borderRadius: 20,
            }
      }
      transition={{
        left: { duration: FLY_MS, ease: EASE },
        top: { duration: FLY_MS, ease: EASE },
        scale: { duration: FLY_MS, ease: EASE },
        borderRadius: { duration: FLY_MS, ease: EASE },
        opacity: { duration: 0.18, ease: EASE },
      }}
      onAnimationComplete={() => {
        if (run) onDone();
      }}
    >
      {thumbnail?.trim() ? (
        <img
          src={thumbnail.trim()}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[color:var(--accent)]">
          <Download size={14} />
        </span>
      )}
    </motion.div>,
    document.body,
  );
}

export function measureDownloaderCloseMorph(): DownloaderCloseMorphPayload | null {
  const rail = document.querySelector<HTMLElement>('[data-rail-tab="downloader"]');
  if (!rail) return null;
  const to = rail.getBoundingClientRect();
  if (to.width <= 0 || to.height <= 0) return null;

  const thumbEl = document.querySelector<HTMLElement>("[data-downloader-hero-thumb]");
  const from = (thumbEl ?? document.querySelector<HTMLElement>("[data-downloader-panel]"))?.getBoundingClientRect();
  if (!from || from.width <= 0 || from.height <= 0) return null;

  const img = thumbEl?.querySelector("img");
  const thumbnail = img?.currentSrc || img?.src || null;

  return { thumbnail, from, to };
}

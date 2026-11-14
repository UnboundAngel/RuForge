import { motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, type CSSProperties, type MouseEvent } from "react";

import { mainWindowPortalRoot } from "@/lib/mainWindowFrame";
import type { GuideClip } from "./GuidePhaseClip";
import { SHRINK_EASE } from "./islandShared";

function mediaLooksLikeVideo(src: string): boolean {
  return /\.mp4(?:$|\?)/i.test(src);
}

/** Outside-click collapse ignores anything inside this marker. */
export const LIGHTBOX_ATTR = "data-onboarding-lightbox";

export function OnboardingMediaLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const isVideo = mediaLooksLikeVideo(src);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <motion.div
      {...{ [LIGHTBOX_ATTR]: "" }}
      className="pointer-events-auto fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-8"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.18, ease: SHRINK_EASE } }}
      exit={{ opacity: 0, transition: { duration: 0.14, ease: SHRINK_EASE } }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close demo"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal
        aria-label={alt}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: SHRINK_EASE } }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14, ease: SHRINK_EASE } }}
        className="relative z-[1] w-[min(96vw,1280px,calc(88vh*1.6))] overflow-hidden rounded-[20px] bg-[color:var(--rf-field)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-[16/10] w-full bg-[color:var(--bg)]">
          {isVideo ? (
            <video
              src={src}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              controls={false}
            />
          ) : (
            <img src={src} alt={alt} className="h-full w-full object-cover" draggable={false} />
          )}
        </div>
      </motion.div>
    </motion.div>,
    mainWindowPortalRoot(),
  );
}

export function ExpandedDemo({
  mediaSrc,
  mediaAlt,
  caption,
  objectFit = "cover",
  lightboxSrc,
  mediaPaused = false,
  showClickContinue = false,
  clip,
  onContinue,
  onOpenLightbox,
}: {
  mediaSrc?: string;
  mediaAlt: string;
  caption: string;
  objectFit?: "cover" | "contain";
  lightboxSrc?: string;
  mediaPaused?: boolean;
  showClickContinue?: boolean;
  /** Recorded clip that takes the media slot. */
  clip?: GuideClip;
  onContinue?: () => void;
  onOpenLightbox?: () => void;
}) {
  const reduced = useReducedMotion();
  const canLightbox = Boolean(lightboxSrc && onOpenLightbox && !clip);

  const openLightbox = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenLightbox?.();
  };

  const islandMedia = clip ? (
    reduced ? (
      <img src={clip.poster} alt={mediaAlt} className="h-full w-full object-cover" draggable={false} />
    ) : (
      <video
        src={clip.src}
        poster={clip.poster}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
        className="h-full w-full object-cover"
      />
    )
  ) : mediaPaused || !mediaSrc ? (
    <div className="h-full w-full bg-[color:var(--rf-field-raised)]" aria-hidden />
  ) : (
    <img
      src={mediaSrc}
      alt={mediaAlt}
      className={
        objectFit === "contain"
          ? "max-h-[88%] max-w-[88%] object-contain"
          : "h-full w-full object-cover"
      }
      draggable={false}
    />
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, delay: 0.08 } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      className="absolute inset-0 flex cursor-pointer flex-col items-center justify-between p-4"
      onClick={(e) => {
        e.stopPropagation();
        onContinue?.();
      }}
    >
      {canLightbox ? (
        <button
          type="button"
          onClick={openLightbox}
          className="flex h-[200px] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-2xl bg-[color:var(--rf-field-raised)] p-0"
          aria-label={`Enlarge ${mediaAlt}`}
        >
          {islandMedia}
        </button>
      ) : (
        <div className="flex h-[200px] w-full items-center justify-center overflow-hidden rounded-2xl bg-[color:var(--rf-field-raised)]">
          {islandMedia}
        </div>
      )}
      <div className="flex flex-col items-center gap-1 px-1">
        <p className="text-center text-[13px] font-medium leading-snug text-stone-300">
          {caption}
        </p>
        {showClickContinue ? (
          <p className="text-center text-[11px] font-medium tracking-wide text-[color:var(--accent)]">
            Click to continue
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

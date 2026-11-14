import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { overlayFadeTransition } from "@/lib/overlayMotion";

export type GuideClip = { src: string; poster: string };

/** Height of the 16:10 clip across the card's 310px inner width. */
export const GUIDE_CLIP_H = 194;

/** Looping muted clip for the current beat. Clips cross-fade; the pointer and focus pass straight through. */
export function GuidePhaseClip({ clip, clipKey }: { clip: GuideClip; clipKey: string }) {
  const reduced = useReducedMotion();
  const fade = reduced ? { duration: 0 } : overlayFadeTransition;

  return (
    <div
      aria-hidden
      className="pointer-events-none relative shrink-0 overflow-hidden rounded-[20px] bg-black"
      style={{ height: GUIDE_CLIP_H }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={clipKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: fade }}
          exit={{ opacity: 0, transition: fade }}
          className="absolute inset-0"
        >
          {reduced ? (
            <img src={clip.poster} alt="" draggable={false} className="h-full w-full object-cover" />
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
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

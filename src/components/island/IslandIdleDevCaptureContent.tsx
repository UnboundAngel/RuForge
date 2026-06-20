import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "motion/react";
import type { MouseEvent } from "react";

type IslandIdleDevCaptureContentProps = {
  hover: boolean;
  busy: boolean;
  onCapture: (e: MouseEvent) => void;
};

export function IslandIdleDevCaptureContent({
  hover,
  busy,
  onCapture,
}: IslandIdleDevCaptureContentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, delay: 0.1 } }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
      className="absolute inset-0"
    >
      <div className="flex h-full items-center px-2">
        <AnimatePresence initial={false}>
          {hover ? (
            <motion.button
              key="idle-capture-btn"
              type="button"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onCapture(e);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-stone-100 transition-opacity disabled:opacity-50 active:scale-[0.97]"
              aria-label="Capture screen"
            >
              <Icon icon="tabler:capture" width={15} height={15} aria-hidden />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}


import { motion } from "motion/react";
import type { MouseEvent } from "react";

type IslandCaptureSavedContentProps = {
  caption: string;
  previewSrc: string;
  onOpen: (e: MouseEvent) => void;
};

export function IslandCaptureSavedContent({
  caption,
  previewSrc,
  onOpen,
}: IslandCaptureSavedContentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, delay: 0.04 } }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
      className="absolute inset-0"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(e);
        }}
        className="flex h-full w-full min-w-0 items-center gap-2 px-2 text-left active:scale-[0.99]"
        aria-label={`Open ${caption}`}
      >
        <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-white/10">
          <img src={previewSrc} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0 truncate text-[11px] font-medium text-stone-200 whitespace-nowrap">
          {caption}
        </span>
      </button>
    </motion.div>
  );
}

export function captureIslandWidthForCaption(caption: string): number {
  const text = caption.trim() || "Captured";
  return Math.min(200, Math.max(136, Math.ceil(text.length * 6.5) + 40));
}

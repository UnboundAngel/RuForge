import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import { formatZoom } from "@/lib/freezeFrameZoom";

export function FreezeZoomPill({
  scale,
  onReset,
  className,
}: {
  scale: number;
  onReset: () => void;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {scale > 1 && (
        <motion.button
          type="button"
          data-freeze-zoom-ignore
          data-tooltip="Reset zoom (Esc)"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className={cn(
            "absolute z-[75] flex items-center gap-1.5 rounded-full bg-black/75 py-1 pl-2.5 pr-3 text-[12px] font-semibold tabular-nums text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-colors hover:bg-black/90",
            className,
          )}
        >
          <Icon icon="tabler:zoom-in" className="h-3.5 w-3.5" aria-hidden />
          {formatZoom(scale)}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

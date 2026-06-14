import { Icon } from "@iconify/react";
import { motion } from "motion/react";
import { useState, type MouseEvent } from "react";

import { ActivityIslandWaveform } from "./ActivityIslandWaveform";

type Props = {
  levels: readonly number[];
  coverSrc: string | null;
  accentColor: string;
  muted?: boolean;
  onPopOut?: (e: MouseEvent) => void;
};

export function IslandWaveformHoverSlot({
  levels,
  coverSrc,
  accentColor,
  muted,
  onPopOut,
}: Props) {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className="relative ml-auto flex h-7 min-w-[2.125rem] items-center justify-center self-start"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={false}
        animate={{ opacity: hovering ? 0 : 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: "none" }}
        aria-hidden={hovering}
      >
        <ActivityIslandWaveform
          levels={levels}
          coverSrc={coverSrc}
          accentColor={accentColor}
          muted={muted}
        />
      </motion.div>

      <motion.button
        type="button"
        className="absolute inset-0 flex items-center justify-center text-zinc-300 transition-colors hover:text-white"
        initial={false}
        animate={{ opacity: hovering ? 1 : 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: hovering ? "auto" : "none" }}
        aria-label="Mini player"
        onClick={(e) => {
          e.stopPropagation();
          onPopOut?.(e);
        }}
      >
        <Icon icon="material-symbols:ad-group-outline" width={18} className="pointer-events-none" />
      </motion.button>
    </div>
  );
}

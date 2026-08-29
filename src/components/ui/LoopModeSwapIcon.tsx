import { Icon } from "@iconify/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { loopModeIcon, type LoopMode } from "@/playbackLoopStorage";
import { cn } from "@/lib/utils";

type Props = {
  mode: LoopMode;
  size?: number;
  className?: string;
};

const ENTER = { opacity: 0, rotate: -20, scale: 0.8 };
const REST = { opacity: 1, rotate: 0, scale: 1 };
const EXIT = { opacity: 0, rotate: 20, scale: 0.8 };

/** Crossfade + twist when cycling off → all → one. */
export function LoopModeSwapIcon({ mode, size = 16, className }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={mode}
        className={cn("flex items-center justify-center", className)}
        initial={reduceMotion ? false : ENTER}
        animate={REST}
        exit={reduceMotion ? { opacity: 0 } : EXIT}
        transition={{ duration: reduceMotion ? 0 : 0.15 }}
      >
        <Icon icon={loopModeIcon(mode)} width={size} height={size} />
      </motion.span>
    </AnimatePresence>
  );
}

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { motionDuration, pageSlideTransition, pageTransition } from "@/lib/overlayMotion";

export type SwapDirection = "tab" | "forward" | "back";

// Timing lives in the variants so an exiting page follows the presence custom, not its last render.
const variants: Variants = {
  enter: (c: SwapDirection) =>
    c === "forward"
      ? { opacity: 0, x: 28 }
      : c === "back"
        ? { opacity: 0, x: -28 }
        : { opacity: 0, y: 8 },
  settled: (c: SwapDirection) => ({
    opacity: 1,
    x: 0,
    y: 0,
    transition: c === "tab" ? pageTransition : pageSlideTransition,
  }),
  leave: (c: SwapDirection) =>
    c === "forward"
      ? { opacity: 0, x: -28, transition: pageSlideTransition }
      : c === "back"
        ? { opacity: 0, x: 28, transition: pageSlideTransition }
        : { opacity: 0, y: -8, transition: pageTransition },
};

const REDUCED: Variants = {
  enter: { opacity: 1 },
  settled: { opacity: 1, transition: { duration: 0 } },
  leave: { opacity: 1, transition: { duration: 0 } },
};

function PageBody({
  swapKey,
  direction,
  reduce,
  onEnter,
  className,
  children,
}: {
  swapKey: string;
  direction: SwapDirection;
  reduce: boolean | null;
  onEnter?: (key: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const firedKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    // Strict Mode replays the mount effect; the replay must not count as a second entry.
    if (firedKey.current === swapKey) return;
    firedKey.current = swapKey;
    onEnter?.(swapKey);
    // Only the mount of this keyed page matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <motion.div
      className={className}
      custom={direction}
      variants={reduce ? REDUCED : variants}
      initial="enter"
      animate="settled"
      exit="leave"
    >
      {children}
    </motion.div>
  );
}

/**
 * Swaps any page, tab or sub-page: the old one fades out, then the new one rises in.
 * "tab" is the house 8px rise; use "forward" / "back" for drill-in pages that slide sideways.
 * Change `swapKey` to swap. `onEnter` runs when the incoming page mounts, after the old one left.
 */
export function PageSwap({
  swapKey,
  direction = "tab",
  onEnter,
  className,
  children,
}: {
  swapKey: string;
  direction?: SwapDirection;
  onEnter?: (key: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <PageBody
        key={swapKey}
        swapKey={swapKey}
        direction={direction}
        reduce={reduce}
        onEnter={onEnter}
        className={className}
      >
        {children}
      </PageBody>
    </AnimatePresence>
  );
}

/** Fades in and out only when it appears or disappears, and stays still while `show` holds. */
export function FadePresence({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {show ? (
        <motion.div
          key="fade-presence"
          className={className}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={motionDuration(reduce, pageTransition)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

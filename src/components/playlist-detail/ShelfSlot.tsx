import type { ReactNode, Ref } from "react";
import { motion, useReducedMotion } from "motion/react";
import { OVERLAY_EASE, overlayFadeTransition, overlayPanelTransition, overlaySettleTransition } from "@/lib/overlayMotion";
import { fleeingCards } from "./addFlyRegistry";

export const CARD_W = 248;
export const CARD_GAP = 12;
const SHRUNK = 0.94;
const STAGGER = 0.03;
const MAX_STAGGERED = 6;

type Props = {
  /** Path or video id; a card that left for the playlist exits at once instead of fading. */
  id: string;
  index?: number;
  /** Takes the place of a gap that already held its width, so nothing animates in. */
  instant?: boolean;
  children: ReactNode;
  /** popLayout measures the exiting child through this. */
  ref?: Ref<HTMLDivElement>;
};

/**
 * One shelf item. Neighbours close and open around it with transform-only layout moves
 * (use inside `AnimatePresence mode="popLayout"`), so no width is ever animated.
 */
export function ShelfSlot({ id, index = 0, instant, children, ref }: Props) {
  const reduce = useReducedMotion();
  const none = { duration: 0 };
  // Read when the exit starts, because the card sets the flag on the click that removes it.
  const variants = {
    exit: () =>
      reduce || fleeingCards.has(id)
        ? { opacity: 0, transition: none }
        : { opacity: 0, scale: SHRUNK, transition: overlayFadeTransition },
  };
  return (
    <motion.div
      ref={ref}
      layout="position"
      variants={variants}
      initial={instant || reduce ? false : { opacity: 0, scale: SHRUNK }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: reduce ? none : { duration: overlayPanelTransition.duration, ease: OVERLAY_EASE, delay: Math.min(index, MAX_STAGGERED) * STAGGER },
      }}
      exit="exit"
      transition={{ layout: reduce ? none : overlaySettleTransition }}
      className="shrink-0"
      style={{ width: CARD_W + CARD_GAP, paddingRight: CARD_GAP }}
    >
      {children}
    </motion.div>
  );
}

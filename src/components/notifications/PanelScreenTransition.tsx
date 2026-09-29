import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { useState, type ReactNode } from "react";
import { OVERLAY_EASE } from "@/lib/overlayMotion";

const SLIDE_PX = 24;

/** `dir` follows screen order, so going deeper slides in from the right and back slides in from the left. */
const variants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * SLIDE_PX }),
  center: { opacity: 1, x: 0, transition: { duration: 0.2, ease: OVERLAY_EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -SLIDE_PX, transition: { duration: 0.12, ease: OVERLAY_EASE } }),
};

const reducedVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

type Props = {
  screenKey: string;
  order: number;
  onSwap?: () => void;
  children: ReactNode;
};

export function PanelScreenTransition({ screenKey, order, onSwap, children }: Props) {
  const reduceMotion = useReducedMotion();
  const [nav, setNav] = useState({ key: screenKey, order, dir: 0 });
  if (nav.key !== screenKey) setNav({ key: screenKey, order, dir: Math.sign(order - nav.order) });

  return (
    <AnimatePresence mode="wait" initial={false} custom={nav.dir} onExitComplete={onSwap}>
      <motion.div
        key={screenKey}
        custom={nav.dir}
        variants={reduceMotion ? reducedVariants : variants}
        initial="enter"
        animate="center"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

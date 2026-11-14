import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { clearOnboardingMock } from "@/lib/onboardingMock";
import { useOnboardingMock } from "@/lib/useOnboardingMockPlaylists";
import { motionDuration, overlayFadeTransition } from "@/lib/overlayMotion";

/** The tour's demo card fades in with the grid and out when the tour ends, then removes the mock. */
export function DemoPlaylistCardShell({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const { leaving } = useOnboardingMock();
  return (
    <motion.div
      // Mounting mid-exit (Back from the held demo page) must fade out from visible, not pop.
      initial={{ opacity: leaving ? 1 : 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={motionDuration(reduce, overlayFadeTransition)}
      onAnimationComplete={() => {
        if (leaving) clearOnboardingMock();
      }}
      className="min-w-0"
    >
      {children}
    </motion.div>
  );
}

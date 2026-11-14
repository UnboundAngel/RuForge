import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import type { OnboardingGuidePhase } from "@/lib/onboardingSteps";
import { GuidePhaseStack } from "./GuidePhaseStack";
import { SHRINK_EASE } from "./islandShared";

/** Phase icon stack, then one line of text that cross-fades. */
export function CompactGuidePill({
  Icon,
  label,
  phases,
  index,
}: {
  Icon?: LucideIcon;
  label: string;
  phases: readonly OnboardingGuidePhase[];
  index: number;
}) {
  const reduced = useReducedMotion();
  const fade = reduced ? { duration: 0 } : { duration: 0.18, ease: SHRINK_EASE };
  return (
    <div className="flex h-full w-full items-center justify-center gap-2">
      <GuidePhaseStack phases={phases} index={index} size={20} currentIcon={Icon} />
      <div className="relative flex h-full min-w-0 items-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0, transition: fade }}
            exit={{ opacity: 0, y: reduced ? 0 : -6, transition: fade }}
            className="max-w-[150px] truncate whitespace-nowrap text-[12px] font-semibold tracking-tight text-stone-100"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

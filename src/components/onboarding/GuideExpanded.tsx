import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { OnboardingGuidePhase } from "@/lib/onboardingSteps";
import { GUIDE_CLIP_H, GuidePhaseClip } from "./GuidePhaseClip";
import { GuidePhaseStack } from "./GuidePhaseStack";
import { SHRINK_EASE } from "./islandShared";

const CHROME_H = 112;
const CARD_GAP = 8;

/** Card height for a guide card, plus room for a clip when the beats have one. */
export function checklistCardHeight(withClip = false): number {
  return CHROME_H + (withClip ? GUIDE_CLIP_H + CARD_GAP : 0);
}

export function GuideExpanded({ caption }: { caption: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, delay: 0.06 } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      className="absolute inset-0 flex flex-col items-center justify-center p-5"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-center text-[13px] font-medium leading-relaxed text-stone-300">
        {caption}
      </p>
    </motion.div>
  );
}

/** Header with the phase stack, then the caption. Stays mounted across beats so the height can animate. */
export function GuideChecklistCard({
  phases,
  index,
}: {
  phases: readonly OnboardingGuidePhase[];
  index: number;
}) {
  const reduced = useReducedMotion();
  const current = phases[index];
  if (!current) return null;
  const fade = reduced ? { duration: 0 } : { duration: 0.2, ease: SHRINK_EASE };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, delay: 0.06 } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      className="absolute inset-0 flex flex-col gap-2 px-5 py-4"
      onClick={(e) => e.stopPropagation()}
    >
      {current.clip ? <GuidePhaseClip clip={current.clip} clipKey={current.id} /> : null}
      <div className="flex items-center gap-2">
        <GuidePhaseStack phases={phases} index={index} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-stone-100">
          {current.compact}
        </span>
        <span className="shrink-0 text-[11px] font-medium text-stone-500">
          {index + 1} of {phases.length}
        </span>
      </div>
      <div className="relative min-h-[40px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: fade }}
            exit={{ opacity: 0, transition: fade }}
            className="text-[13px] font-medium leading-snug text-stone-300"
          >
            {current.expandedCaption}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

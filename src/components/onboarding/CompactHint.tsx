import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { OnboardingGuidePhase } from "@/lib/onboardingSteps";
import logo from "@/assets/ruforgeAppIcon.png";
import { AltKeyIcon } from "./AltKeyIcon";
import { CompactGuidePill } from "./CompactGuidePill";
import { SHRINK_EASE } from "./islandShared";

const COMPACT_SLIDE_TRANSITION = {
  duration: 0.32,
  ease: SHRINK_EASE,
} as const;

export function CompactPillContent({
  children,
  exit = false,
}: {
  children: ReactNode;
  exit?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: SHRINK_EASE } }}
      exit={
        exit
          ? { opacity: 0, transition: { duration: 0.14, ease: SHRINK_EASE } }
          : { opacity: 0, scale: 0.96, transition: { duration: 0.14, ease: SHRINK_EASE } }
      }
      className="absolute inset-0 flex h-full items-center justify-center gap-2 px-3"
    >
      {children}
    </motion.div>
  );
}

function RuForgeIconChip() {
  return (
    <img
      src={logo}
      alt=""
      aria-hidden
      draggable={false}
      className="h-4 w-4 shrink-0 rounded-[4px] object-cover"
    />
  );
}

export type CompactGuideInfo = {
  /** Text the pill shows right now: phase title, progress hint or "Nice". */
  label: string;
  Icon?: LucideIcon;
  phases: readonly OnboardingGuidePhase[];
  index: number;
};

export function CompactHint({
  purpose,
  followUp,
  holdComplete,
  variant = "alt-hold",
  guide,
  demoIcon: DemoIcon,
}: {
  purpose: string;
  followUp: string;
  holdComplete: boolean;
  variant?: "alt-hold" | "tap-settings";
  guide?: CompactGuideInfo | null;
  demoIcon?: LucideIcon;
}) {
  const reducedMotion = useReducedMotion();
  const slideClass =
    "absolute inset-0 flex h-full items-center justify-center gap-1.5 px-3";
  const slideTransition = reducedMotion
    ? { duration: 0 }
    : COMPACT_SLIDE_TRANSITION;

  if (variant === "tap-settings") {
    return (
      <CompactPillContent exit>
        <div className="relative h-full w-full overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {guide ? (
              <motion.div
                key="guide"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: slideTransition }}
                exit={{ opacity: 0, y: -10, transition: slideTransition }}
                className={slideClass}
              >
                <CompactGuidePill {...guide} />
              </motion.div>
            ) : (
              <motion.div
                key="demo"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: slideTransition }}
                exit={{ opacity: 0, y: -10, transition: slideTransition }}
                className={slideClass}
              >
                {DemoIcon ? (
                  <DemoIcon size={14} strokeWidth={2.25} className="shrink-0 text-[color:var(--accent)]" aria-hidden />
                ) : null}
                <span className="whitespace-nowrap text-[12px] font-semibold tracking-tight text-stone-100">
                  {purpose}
                </span>
                <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-[color:var(--accent)]">
                  click
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CompactPillContent>
    );
  }

  return (
    <CompactPillContent exit>
      <div className="relative h-full w-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {holdComplete ? (
            <motion.div
              key="swap"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: slideTransition }}
              exit={{ opacity: 0, y: -10, transition: slideTransition }}
              className={slideClass}
            >
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-stone-100">
                Click
              </span>
              <RuForgeIconChip />
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-stone-100">
                {followUp}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="hold"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: slideTransition }}
              exit={{ opacity: 0, y: -10, transition: slideTransition }}
              className={slideClass}
            >
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-stone-100">
                {purpose}
              </span>
              <span className="whitespace-nowrap text-[12px] font-medium text-stone-400">· hold</span>
              <AltKeyIcon />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CompactPillContent>
  );
}

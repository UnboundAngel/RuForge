import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import type { OnboardingGuidePhase } from "@/lib/onboardingSteps";
import { overlaySettleTransition } from "@/lib/overlayMotion";

/** Overlapping phase icons like the playlist header avatars: the current phase leads, the rest tuck behind. */
export function GuidePhaseStack({
  phases,
  index,
  size = 24,
  currentIcon,
}: {
  phases: readonly OnboardingGuidePhase[];
  index: number;
  size?: number;
  /** Replaces the current phase icon (the pill shows a tick while "Nice" lands). */
  currentIcon?: LucideIcon;
}) {
  const reduced = useReducedMotion();
  const ordered = phases
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.i === index ? -1 : b.i === index ? 1 : a.i - b.i));
  return (
    <div className="flex shrink-0 items-center" aria-hidden>
      {ordered.map(({ p, i }, pos) => {
        const active = i === index;
        const Icon = (active ? currentIcon : undefined) ?? p.icon;
        return (
          <motion.div
            key={p.id}
            layout={!reduced}
            transition={reduced ? { duration: 0 } : overlaySettleTransition}
            className={`relative flex items-center justify-center rounded-full ring-2 ring-black ${
              pos > 0 ? "-ml-2" : ""
            } ${active ? "bg-stone-800" : "bg-stone-900"}`}
            style={{ width: size, height: size, zIndex: ordered.length - pos }}
          >
            {Icon ? (
              <Icon
                size={Math.round(size * 0.55)}
                strokeWidth={2.25}
                className={active ? "text-[color:var(--accent)]" : "text-stone-500"}
              />
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}

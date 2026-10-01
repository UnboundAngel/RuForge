import { useRef } from "react";

import {
  easeInOutSine,
  easeInOutSineSlope,
  useProgressStreak,
  type StreakTiming,
} from "@/hooks/useProgressStreak";

/** Slower, softer launch than the island ring: the bar is wide and sits center stage. */
const BAR_STREAK: StreakTiming = {
  travel: (end) => 1.1 + 1.4 * end,
  ease: easeInOutSine,
  slope: easeInOutSineSlope,
  lenPerSpeed: 0.35,
  minLen: 0.01,
  maxLen: 0.25,
  fadeInS: 0.18,
  fadeOutS: 0.35,
  restS: 0.8,
};

/** Streak along a horizontal progress fill. Mount inside the track (which clips it), beside the fill. */
export function ProgressBarStreak({ pct }: { pct: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const running = useProgressStreak(pct, BAR_STREAK, ({ x, len, opacity }) => {
    const el = ref.current;
    if (!el) return;
    el.style.left = `${(x - len) * 100}%`;
    el.style.width = `${len * 100}%`;
    el.style.opacity = String(opacity);
  });
  if (!running) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 rounded-full bg-gradient-to-r from-transparent to-white/90 opacity-0 shadow-[0_0_6px_rgb(255_255_255/0.55)]"
    />
  );
}

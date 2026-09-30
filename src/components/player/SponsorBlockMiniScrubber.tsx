import React from "react";
import type { SponsorBlockSkipCategory } from "../../sponsorBlock";
import { SPONSORBLOCK_CATEGORY_COLORS } from "../../sponsorBlockColors";

/** Where each category typically sits in a video, as fractions of the track. */
const TYPICAL_SPAN: Record<SponsorBlockSkipCategory, [number, number]> = {
  intro: [0, 0.2],
  preview: [0.04, 0.2],
  sponsor: [0.3, 0.58],
  interaction: [0.44, 0.56],
  filler: [0.34, 0.6],
  selfpromo: [0.66, 0.82],
  outro: [0.8, 1],
};

type Props = {
  category: SponsorBlockSkipCategory;
  dim?: boolean;
  className?: string;
};

export const SponsorBlockMiniScrubber: React.FC<Props> = ({ category, dim = false, className = "" }) => {
  const [a, b] = TYPICAL_SPAN[category];
  return (
    <span
      aria-hidden
      className={`relative block h-1 w-7 shrink-0 overflow-hidden rounded-full bg-white/15 ${dim ? "opacity-35" : ""} ${className}`}
    >
      <span
        className="absolute inset-y-0 rounded-full"
        style={{
          left: `${a * 100}%`,
          width: `${(b - a) * 100}%`,
          backgroundColor: SPONSORBLOCK_CATEGORY_COLORS[category],
        }}
      />
    </span>
  );
};

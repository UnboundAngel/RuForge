import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { SkipForward, Undo2 } from "lucide-react";
import type { SponsorBlockSkipPrompt } from "../../hooks/useSponsorBlockPlayback";
import { SponsorBlockMiniScrubber } from "./SponsorBlockMiniScrubber";

type SkipButtonProps = {
  prompt: SponsorBlockSkipPrompt;
  onClick: () => void;
};

export const SponsorBlockSkipButton: React.FC<SkipButtonProps> = ({ prompt, onClick }) => {
  const reduceMotion = useReducedMotion();
  const Icon = prompt.kind === "unskip" ? Undo2 : SkipForward;
  const offset = reduceMotion ? 0 : 8;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: offset }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: offset }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className="rf-sb-skip-btn pointer-events-auto absolute right-6 z-[56] flex select-none items-center gap-2.5 rounded-full bg-[#1D1613]/90 py-2 pl-3.5 pr-3 text-[12px] font-semibold text-stone-100 shadow-[0_10px_28px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-[#271C18] active:scale-95 sm:right-8"
    >
      <SponsorBlockMiniScrubber category={prompt.category} />
      {prompt.label}
      <Icon size={14} strokeWidth={2.5} aria-hidden className="text-stone-400" />
    </motion.button>
  );
};

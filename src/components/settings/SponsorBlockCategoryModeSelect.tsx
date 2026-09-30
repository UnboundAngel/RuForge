import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Ban, ChevronDown, FastForward, MousePointerClick, type LucideIcon } from "lucide-react";
import type { SponsorBlockCategoryMode } from "../../sponsorBlock";

const MODE_OPTIONS: ReadonlyArray<{
  value: SponsorBlockCategoryMode;
  label: string;
  Icon: LucideIcon;
  tone: string;
}> = [
  { value: "auto", label: "Auto-skip", Icon: FastForward, tone: "text-[color:var(--accent)]" },
  { value: "button", label: "Show skip button", Icon: MousePointerClick, tone: "text-stone-200" },
  { value: "off", label: "Disabled", Icon: Ban, tone: "text-stone-500" },
];

type Props = {
  value: SponsorBlockCategoryMode;
  onChange: (m: SponsorBlockCategoryMode) => void;
};

export const SponsorBlockCategoryModeSelect: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODE_OPTIONS.find((o) => o.value === value) ?? MODE_OPTIONS[1];

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-3 min-w-[172px] px-3 py-2 bg-[#1D1613] hover:bg-[#241A16] cursor-pointer shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 transition-all rounded-xl ${
          open ? "rounded-b-none border-b-0" : ""
        }`}
      >
        <span className={`flex items-center gap-2 text-[12px] font-medium text-left ${current.tone}`}>
          <current.Icon size={14} strokeWidth={2.25} aria-hidden />
          {current.label}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-stone-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute top-full left-0 right-0 z-50 bg-[#1D1613] border border-white/5 border-t-0 rounded-b-xl overflow-hidden shadow-[0_15px_30px_rgba(0,0,0,0.6)]"
          >
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition-colors hover:bg-white/5 ${opt.tone} ${
                  value === opt.value ? "bg-white/[0.05]" : "opacity-80 hover:opacity-100"
                }`}
              >
                <opt.Icon size={14} strokeWidth={2.25} aria-hidden />
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

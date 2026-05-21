import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { SponsorBlockCategoryMode } from "../../sponsorBlock";

const MODE_OPTIONS: ReadonlyArray<{ value: SponsorBlockCategoryMode; label: string }> = [
  { value: "button", label: "Show skip button" },
  { value: "auto", label: "Auto-skip" },
  { value: "off", label: "Disabled" },
];

type Props = {
  value: SponsorBlockCategoryMode;
  onChange: (m: SponsorBlockCategoryMode) => void;
};

export const SponsorBlockCategoryModeSelect: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODE_OPTIONS.find((o) => o.value === value) ?? MODE_OPTIONS[0];

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
        className={`flex items-center justify-between gap-3 min-w-[148px] px-3 py-2 bg-[#1D1613] hover:bg-stone-800 cursor-pointer shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 transition-all rounded-xl ${
          open ? "rounded-b-none border-b-0" : ""
        }`}
      >
        <span className="text-[10px] font-black tracking-wide text-stone-300 text-left">
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
                className={`w-full px-3 py-2.5 text-left text-[10px] font-black tracking-wide border-t border-white/[0.03] transition-colors ${
                  value === opt.value
                    ? "bg-[color:var(--accent)] text-[#1D1613]"
                    : "text-stone-400 hover:bg-white/5"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

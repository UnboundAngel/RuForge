import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "@iconify/react";

/** At or below this length (chars), description is always visible and no info icon. */
export const SETTINGS_DESCRIPTION_ALWAYS_SHOW_MAX = 88;

export function isLongSettingsDescription(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.length > SETTINGS_DESCRIPTION_ALWAYS_SHOW_MAX;
}

type SettingsDescriptionProps = {
  description: string;
  className?: string;
  /** Parent collapsed (e.g. tree hidden): dismiss hover tooltip. */
  forceClose?: boolean;
};

export const SettingsDescription: React.FC<SettingsDescriptionProps> = ({
  description,
  className = "",
  forceClose = false,
}) => {
  const trimmed = description.trim();
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (forceClose) setHovered(false);
  }, [forceClose]);

  if (!trimmed) return null;

  const long = isLongSettingsDescription(trimmed);

  if (!long) {
    return (
      <p
        className={`text-[11px] text-stone-500 leading-relaxed max-w-md ${className}`}
      >
        {trimmed}
      </p>
    );
  }

  const showTooltip = hovered && !forceClose;

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label="More info"
        className="inline-flex items-center gap-1.5 rounded-md p-0.5 text-stone-500 transition-colors hover:text-stone-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_srgb,var(--accent),transparent_45%)]"
      >
        <Icon icon="mdi:information-variant-circle-outline" width={16} height={16} />
        <span className="text-[10px] text-stone-600">More info</span>
      </button>

      <AnimatePresence>
        {showTooltip ? (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute left-0 top-full z-[120] mt-2 w-max max-w-xs rounded-xl border border-white/10 bg-[#1D1613]/95 px-3 py-2 text-[11px] leading-relaxed text-stone-400 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md"
          >
            {trimmed}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

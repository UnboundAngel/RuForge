import React from "react";
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
  if (!trimmed) return null;

  if (!isLongSettingsDescription(trimmed)) {
    return (
      <p
        className={`text-[11px] text-stone-500 leading-relaxed max-w-md ${className}`}
      >
        {trimmed}
      </p>
    );
  }

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        aria-label="More info"
        data-tooltip={forceClose ? undefined : trimmed}
        className="inline-flex items-center gap-1.5 rounded-md p-0.5 text-stone-500 transition-colors hover:text-stone-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_srgb,var(--accent),transparent_45%)]"
      >
        <Icon icon="mdi:information-variant-circle-outline" width={16} height={16} />
        <span className="text-[10px] text-stone-600">More info</span>
      </button>
    </div>
  );
};

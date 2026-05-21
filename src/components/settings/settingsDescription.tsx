import React, { useEffect, useState } from "react";
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
  /** Parent collapsed (e.g. tree hidden): close expandable long descriptions. */
  forceClose?: boolean;
};

export const SettingsDescription: React.FC<SettingsDescriptionProps> = ({
  description,
  className = "",
  forceClose = false,
}) => {
  const trimmed = description.trim();
  if (!trimmed) return null;

  const long = isLongSettingsDescription(trimmed);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceClose) setOpen(false);
  }, [forceClose]);

  if (!long) {
    return (
      <p
        className={`text-[11px] text-stone-500 leading-relaxed max-w-[340px] ${className}`}
      >
        {trimmed}
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={open ? "Hide description" : "Show description"}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className={`shrink-0 p-0.5 rounded-md transition-colors ${
            open
              ? "text-[color:var(--accent)]"
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          <Icon icon="mdi:information-variant-circle-outline" width={16} height={16} />
        </button>
        {!open ? (
          <span className="text-[10px] text-stone-600">More info</span>
        ) : null}
      </div>
      {open ? (
        <p className="text-[11px] text-stone-500 leading-relaxed max-w-[340px] mt-1.5">
          {trimmed}
        </p>
      ) : null}
    </div>
  );
};

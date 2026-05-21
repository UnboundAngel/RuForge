import React from "react";
import { SettingsDescription } from "./settingsDescription";

export type SettingsTreeRowProps = {
  title: string;
  description: string;
  indentPx?: number;
  leadingIcon?: React.ReactNode;
  subtitle?: React.ReactNode;
  control?: React.ReactNode;
  belowTitle?: React.ReactNode;
  onRowClick?: () => void;
  active?: boolean;
  forceCloseDescription?: boolean;
};

/** Generic settings tree row (SponsorBlock uses dedicated layout). */
export const SettingsTreeRow: React.FC<SettingsTreeRowProps> = ({
  title,
  description,
  indentPx = 24,
  leadingIcon,
  subtitle,
  control,
  belowTitle,
  onRowClick,
  active = true,
  forceCloseDescription = false,
}) => (
  <div
    role={onRowClick ? "button" : undefined}
    tabIndex={onRowClick ? 0 : undefined}
    onClick={onRowClick}
    onKeyDown={(e) => {
      if (onRowClick && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onRowClick();
      }
    }}
    className={`group flex items-start justify-between gap-4 py-4 pr-2 rounded-[20px] transition-colors ${
      onRowClick ? "cursor-pointer hover:bg-white/[0.02]" : ""
    }`}
    style={{ paddingLeft: indentPx }}
  >
    <div className="flex items-start gap-5 min-w-0 flex-1">
      {leadingIcon ? (
        <div
          className={`w-12 h-12 flex items-center justify-center shrink-0 transition-colors ${
            active ? "text-[color:var(--accent)]" : "text-stone-500"
          }`}
        >
          {leadingIcon}
        </div>
      ) : null}
      <div className="flex flex-col min-w-0 flex-1 gap-1">
        <h4
          className={`text-sm font-bold transition-colors ${
            active ? "text-stone-100" : "text-stone-400"
          }`}
        >
          {title}
        </h4>
        {subtitle}
        {belowTitle}
        <SettingsDescription
          description={description}
          forceClose={forceCloseDescription}
        />
      </div>
    </div>
    {control ? (
      <div
        className="flex items-center gap-2 shrink-0 self-center"
        onClick={(e) => e.stopPropagation()}
      >
        {control}
      </div>
    ) : null}
  </div>
);

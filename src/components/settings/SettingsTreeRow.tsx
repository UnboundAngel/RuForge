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
  indentPx = 12,
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
    className={`group rf-settings-row ${onRowClick ? "cursor-pointer" : ""}`}
    style={{ paddingLeft: indentPx }}
  >
    <div className="rf-settings-row-label space-y-0.5">
      <h4 className={active ? "text-stone-100" : "text-stone-400"}>{title}</h4>
      {subtitle}
      {belowTitle}
      <SettingsDescription description={description} forceClose={forceCloseDescription} />
    </div>
    {control ? (
      <div className="rf-settings-row-control" onClick={(e) => e.stopPropagation()}>
        {control}
      </div>
    ) : null}
  </div>
);

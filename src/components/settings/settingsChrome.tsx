import React, { createContext, useContext } from "react";
import "./settingsGroup.css";
import { SettingsDescription } from "./settingsDescription";

type SettingsSearchCtx = {
  query: string;
  /** Section title/keywords matched: show every child row. */
  forceShow: boolean;
};

export const SettingsSearchRootContext = createContext("");
const SettingsSearchContext = createContext<SettingsSearchCtx>({
  query: "",
  forceShow: false,
});

export function settingsTextMatches(query: string, ...parts: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((part) => part.toLowerCase().includes(q));
}

interface SettingItemProps {
  title: string;
  description: string;
  /** Extra search terms that are not in the title or description. */
  keywords?: string;
  control?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

const SettingsSectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="rf-settings-section-header">{children}</h3>
);

export const SettingsSection: React.FC<{
  title: string;
  keywords?: string;
  /** Kept so existing call sites compile; every section now shares one header style. */
  variant?: "group";
  /** Short text under the header, outside the panel. */
  intro?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, keywords = "", intro, children }) => {
  const query = useContext(SettingsSearchRootContext);
  const forceShow = settingsTextMatches(query, title, keywords);
  return (
    <SettingsSearchContext.Provider value={{ query, forceShow }}>
      <section className={intro ? "rf-settings-section rf-settings-section--intro" : "rf-settings-section"}>
        <SettingsSectionHeader>{title}</SettingsSectionHeader>
        {intro ? <div className="rf-settings-section-intro">{intro}</div> : null}
        <div className="rf-settings-section-body">{children}</div>
      </section>
    </SettingsSearchContext.Provider>
  );
};

export const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  keywords = "",
  control,
  active = true,
  onClick,
}) => {
  const { query, forceShow } = useContext(SettingsSearchContext);
  if (!settingsTextMatches(query, title, description, keywords) && !forceShow) {
    return null;
  }

  return (
    <div onClick={onClick} className={`group rf-settings-row ${onClick ? "cursor-pointer" : ""}`}>
      <div className="rf-settings-row-label space-y-[0.1875rem]">
        <h4 className={active ? "text-stone-100" : "text-stone-400"}>{title}</h4>
        <SettingsDescription description={description} className="max-w-md" />
      </div>
      {control ? (
        <div className="rf-settings-row-control" onClick={(e) => e.stopPropagation()}>
          {control}
        </div>
      ) : null}
    </div>
  );
};

/** Keeps non-row panels (trees, custom blocks) in search results via keywords. */
export const SearchableBlock: React.FC<{
  keywords: string;
  /** Children are rows themselves (collapsible trees), so no inset block padding. */
  flat?: boolean;
  children: React.ReactNode;
}> = ({ keywords, flat, children }) => {
  const { query, forceShow } = useContext(SettingsSearchContext);
  if (!forceShow && !settingsTextMatches(query, keywords)) {
    return null;
  }
  return <div className={flat ? "rf-settings-rows" : "rf-settings-row rf-settings-row--block"}>{children}</div>;
};

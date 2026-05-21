import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { SponsorBlockIcon } from "../icons/SponsorBlockIcon";
import type { RuforgeSettings } from "../../store/types";
import {
  SPONSORBLOCK_SKIP_CATEGORIES,
  categoryLabel,
  effectiveCategoryMode,
  type SponsorBlockCategoryMode,
  type SponsorBlockSkipCategory,
} from "../../sponsorBlock";
import { SB_ATTRIBUTION_URL } from "../../sponsorBlockConstants";
import { SettingsDescription } from "./settingsDescription";
import { SponsorBlockCategoryModeSelect } from "./SponsorBlockCategoryModeSelect";

const FadingDivider = () => (
  <div className="h-px w-full bg-gradient-to-r from-transparent via-[#EDD79C]/15 to-transparent my-1" />
);

const ToggleSlot: React.FC<{ active: boolean; onClick?: () => void }> = ({ active, onClick }) => (
  <div
    onClick={onClick}
    className={`w-12 h-6 rounded-full relative cursor-pointer transition-all duration-300 border border-white/[0.05] ${
      active
        ? "bg-[#2A1E1A] shadow-[0_2px_5px_rgba(0,0,0,0.5)]"
        : "bg-[#1D1613] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
    }`}
  >
    <motion.div
      animate={{ x: active ? 26 : 2 }}
      transition={{ type: "spring", stiffness: 600, damping: 35 }}
      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-colors duration-300 ${
        active ? "bg-[color:var(--accent)]" : "bg-stone-700"
      }`}
    />
  </div>
);

const CATEGORY_HINTS: Record<SponsorBlockSkipCategory, string> = {
  sponsor: "Paid promotions and brand deals",
  selfpromo: "Merch, channels, or unpaid promos",
  interaction: "Like, subscribe, and reminder segments",
  intro: "Opening animation or recap",
  outro: "End cards and credits",
  preview: "Preview or recap clips",
  filler: "Tangents and non-plot filler",
};

function learnedBadgeIfInteresting(
  settings: RuforgeSettings,
  cat: SponsorBlockSkipCategory,
): string | null {
  const user = settings.sponsorBlockCategoryModes[cat];
  const effective = effectiveCategoryMode(settings, cat);
  if (user === "button" && effective === "auto") return "Learned: auto-skip";
  return null;
}

/** Aligns nested rows with SettingItem title column (icon slot + gap). */
const NESTED_ICON_SPACER = (
  <div className="w-12 h-12 shrink-0" aria-hidden />
);

type CategoryRowProps = {
  cat: SponsorBlockSkipCategory;
  settings: RuforgeSettings;
  onModeChange: (m: SponsorBlockCategoryMode) => void;
  onResetLearning: () => void;
};

function SponsorBlockCategoryRow({ cat, settings, onModeChange, onResetLearning }: CategoryRowProps) {
  const learned = learnedBadgeIfInteresting(settings, cat);
  const off = settings.sponsorBlockCategoryModes[cat] === "off";

  return (
    <div className="group flex items-center justify-between p-6 rounded-[24px] transition-all duration-300 bg-transparent hover:bg-white/[0.02]">
      <div className="flex items-start gap-5 min-w-0 flex-1">
        {NESTED_ICON_SPACER}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={`text-sm font-bold transition-colors ${
                off ? "text-stone-400" : "text-stone-100"
              }`}
            >
              {categoryLabel(cat)}
            </h4>
            {learned ? (
              <span className="text-[9px] font-black uppercase tracking-widest text-[color:var(--accent)] px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--accent),transparent_70%)]">
                {learned}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-stone-500 leading-relaxed max-w-[320px]">
            {CATEGORY_HINTS[cat]}
          </p>
        </div>
      </div>
      <div className="shrink-0 pl-4 flex flex-wrap items-center justify-end gap-2 self-center">
        <SponsorBlockCategoryModeSelect
          value={settings.sponsorBlockCategoryModes[cat]}
          onChange={onModeChange}
        />
        <button
          type="button"
          onClick={onResetLearning}
          className="px-3 py-2 rounded-xl text-[9px] font-black tracking-widest text-stone-500 border border-white/10 hover:bg-white/5 hover:text-stone-300 transition-colors"
        >
          Reset learning
        </button>
      </div>
    </div>
  );
}

export const SponsorBlockSettingsTree: React.FC = () => {
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const [categoriesOpen, setCategoriesOpen] = useState(settings.sponsorBlockEnabled);

  const showCategories = settings.sponsorBlockEnabled && categoriesOpen;
  const forceCloseDesc = !showCategories;

  const patchStats = (
    cat: SponsorBlockSkipCategory,
    patch: Partial<RuforgeSettings["sponsorBlockCategoryStats"][SponsorBlockSkipCategory]>,
  ) => {
    const stats = { ...settings.sponsorBlockCategoryStats };
    stats[cat] = { ...stats[cat], ...patch };
    void updateSetting("sponsorBlockCategoryStats", stats);
  };

  return (
    <>
      <div
        className={`group flex items-center justify-between p-6 rounded-[24px] transition-all duration-300 bg-transparent hover:bg-white/[0.02] ${
          settings.sponsorBlockEnabled ? "cursor-pointer" : ""
        }`}
        onClick={() => {
          if (settings.sponsorBlockEnabled) setCategoriesOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (settings.sponsorBlockEnabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setCategoriesOpen((o) => !o);
          }
        }}
        role={settings.sponsorBlockEnabled ? "button" : undefined}
        tabIndex={settings.sponsorBlockEnabled ? 0 : undefined}
      >
        <div className="flex items-start gap-5 min-w-0 flex-1">
          <div
            className={`w-12 h-12 flex items-center justify-center shrink-0 transition-all duration-300 ${
              settings.sponsorBlockEnabled ? "opacity-100" : "opacity-50"
            }`}
          >
            <SponsorBlockIcon />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h4
                className={`text-sm font-bold transition-colors duration-300 ${
                  settings.sponsorBlockEnabled ? "text-stone-100" : "text-stone-300"
                }`}
              >
                SponsorBlock
              </h4>
              {settings.sponsorBlockEnabled ? (
                <ChevronDown
                  className={`w-4 h-4 text-stone-500 transition-transform duration-200 ${
                    categoriesOpen ? "rotate-180" : ""
                  }`}
                />
              ) : null}
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed max-w-[320px]">
              Segment data from{" "}
              <a
                href={SB_ATTRIBUTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-stone-400"
                onClick={(e) => e.stopPropagation()}
              >
                SponsorBlock contributors
              </a>
              . Licensed under the SponsorBlock database terms.
            </p>
            <SettingsDescription
              description="Crowdsourced segments for sponsors and intros on downloaded YouTube videos. Cached beside each file via the privacy-preserving hash API."
              forceClose={forceCloseDesc}
            />
          </div>
        </div>
        <div className="shrink-0 pl-4 self-center" onClick={(e) => e.stopPropagation()}>
          <ToggleSlot
            active={settings.sponsorBlockEnabled}
            onClick={() => {
              const next = !settings.sponsorBlockEnabled;
              void updateSetting("sponsorBlockEnabled", next);
              if (next) setCategoriesOpen(true);
              else setCategoriesOpen(false);
            }}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showCategories && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {SPONSORBLOCK_SKIP_CATEGORIES.map((cat) => (
              <React.Fragment key={cat}>
                <FadingDivider />
                <SponsorBlockCategoryRow
                  cat={cat}
                  settings={settings}
                  onModeChange={(m) => {
                    const modes = { ...settings.sponsorBlockCategoryModes, [cat]: m };
                    void updateSetting("sponsorBlockCategoryModes", modes);
                  }}
                  onResetLearning={() =>
                    patchStats(cat, { appearances: 0, manualSkips: 0, undoSignals: 0 })
                  }
                />
              </React.Fragment>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

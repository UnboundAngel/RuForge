import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useRuforgeStore } from "../../store/ruforgeStore";
import type { RuforgeSettings } from "../../store/types";
import {
  SPONSORBLOCK_SKIP_CATEGORIES,
  categoryLabel,
  effectiveCategoryMode,
  learnedCategoryMode,
  type SponsorBlockCategoryMode,
  type SponsorBlockSkipCategory,
} from "../../sponsorBlock";
import {
  SB_ATTRIBUTION_URL,
  SB_GRADUATE_MIN_APPEARANCES,
  SB_GRADUATE_MIN_MANUAL_SKIPS,
} from "../../sponsorBlockConstants";
import { SponsorBlockMiniScrubber } from "../player/SponsorBlockMiniScrubber";
import { Switch } from "../ui/Switch";
import { SettingsDescription } from "./settingsDescription";
import { SponsorBlockCategoryModeSelect } from "./SponsorBlockCategoryModeSelect";

const CATEGORY_HINTS: Record<SponsorBlockSkipCategory, string> = {
  sponsor: "Paid promotions and brand deals",
  selfpromo: "Merch, channels, or unpaid promos",
  interaction: "Like, subscribe, and reminder segments",
  intro: "Opening animation or recap",
  outro: "End cards and credits",
  preview: "Preview or recap clips",
  filler: "Tangents and non-plot filler",
};

function learningHint(
  settings: RuforgeSettings,
  cat: SponsorBlockSkipCategory,
): string | null {
  const user = settings.sponsorBlockCategoryModes[cat];
  if (user !== "button") return null;
  const effective = effectiveCategoryMode(settings, cat);
  if (effective === "auto") return "Learned: auto-skip";
  const stats = settings.sponsorBlockCategoryStats[cat];
  if (!stats || (stats.appearances === 0 && stats.manualSkips === 0)) return null;
  if (learnedCategoryMode(stats) === "auto") return "Learned: auto-skip";
  const skips = Math.min(stats.manualSkips, SB_GRADUATE_MIN_MANUAL_SKIPS);
  const seen = Math.min(stats.appearances, SB_GRADUATE_MIN_APPEARANCES);
  return `Learning: ${skips}/${SB_GRADUATE_MIN_MANUAL_SKIPS} skips, ${seen}/${SB_GRADUATE_MIN_APPEARANCES} seen`;
}

type CategoryRowProps = {
  cat: SponsorBlockSkipCategory;
  settings: RuforgeSettings;
  onModeChange: (m: SponsorBlockCategoryMode) => void;
  onResetLearning: () => void;
};

function SponsorBlockCategoryRow({ cat, settings, onModeChange, onResetLearning }: CategoryRowProps) {
  const hint = learningHint(settings, cat);
  const off = settings.sponsorBlockCategoryModes[cat] === "off";
  const learned = hint?.startsWith("Learned") ?? false;
  const stats = settings.sponsorBlockCategoryStats[cat];
  const hasLearning = Boolean(stats && (stats.appearances || stats.manualSkips || stats.undoSignals));

  return (
    <div className="group rf-settings-row">
      <div className="rf-settings-row-label">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2.5">
            <h4 className={off ? "text-stone-400" : "text-stone-100"}>{categoryLabel(cat)}</h4>
            <SponsorBlockMiniScrubber category={cat} dim={off} />
          </div>
          <p className="text-[11px] text-stone-500 leading-relaxed">{CATEGORY_HINTS[cat]}</p>
          {hint ? (
            <p className={`text-[11px] leading-relaxed ${learned ? "text-[color:var(--accent)]" : "text-stone-600"}`}>
              {hint}
            </p>
          ) : null}
        </div>
      </div>
      <div className="rf-settings-row-control flex items-center gap-3">
        {hasLearning ? (
          <button
            type="button"
            onClick={onResetLearning}
            className="text-[11px] font-medium text-stone-500 transition-colors hover:text-stone-200"
          >
            Reset learning
          </button>
        ) : null}
        <SponsorBlockCategoryModeSelect
          value={settings.sponsorBlockCategoryModes[cat]}
          onChange={onModeChange}
        />
      </div>
    </div>
  );
}

export const SponsorBlockSettingsTree: React.FC = () => {
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  /** Clip only while the height animates, so the last row's mode dropdown can overflow once open. */
  const [categoriesSettled, setCategoriesSettled] = useState(false);

  const showCategories = settings.sponsorBlockEnabled && categoriesOpen;
  const forceCloseDesc = !showCategories;

  const patchStats = (
    cat: SponsorBlockSkipCategory,
    patch: Partial<RuforgeSettings["sponsorBlockCategoryStats"][SponsorBlockSkipCategory]>,
  ) => {
    const current = useRuforgeStore.getState().settings.sponsorBlockCategoryStats;
    const stats = { ...current };
    stats[cat] = { ...stats[cat], ...patch };
    void updateSetting("sponsorBlockCategoryStats", stats);
  };

  return (
    <>
      <div
        className={`group rf-settings-row ${settings.sponsorBlockEnabled ? "cursor-pointer" : ""}`}
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
        <div className="rf-settings-row-label space-y-0.5">
          <div className="flex items-center gap-2">
            <h4 className={settings.sponsorBlockEnabled ? "text-stone-100" : "text-stone-400"}>
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
          <p className="text-[11px] text-stone-500 leading-relaxed max-w-md">
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
        <div className="rf-settings-row-control" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={settings.sponsorBlockEnabled}
            onChange={(next) => {
              void updateSetting("sponsorBlockEnabled", next);
              if (!next) setCategoriesOpen(false);
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
            onAnimationStart={() => setCategoriesSettled(false)}
            onAnimationComplete={(def) => {
              if (typeof def === "object" && def !== null && "height" in def && def.height === "auto") {
                setCategoriesSettled(true);
              }
            }}
            className={categoriesSettled ? "" : "overflow-hidden"}
          >
            <div className="rf-settings-subrows">
              {SPONSORBLOCK_SKIP_CATEGORIES.map((cat) => (
                <SponsorBlockCategoryRow
                  key={cat}
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
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

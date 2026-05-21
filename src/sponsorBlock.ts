import type { RuforgeSettings } from "./store/types";
import {
  SB_DEMOTE_UNDO_SIGNALS,
  SB_GRADUATE_MIN_APPEARANCES,
  SB_GRADUATE_MIN_MANUAL_SKIPS,
  SB_GRADUATE_MIN_SKIP_RATE,
} from "./sponsorBlockConstants";

/** Seven skip-button categories (Settings tree leaves). */
export const SPONSORBLOCK_SKIP_CATEGORIES = [
  "sponsor",
  "selfpromo",
  "interaction",
  "intro",
  "outro",
  "preview",
  "filler",
] as const;

export type SponsorBlockSkipCategory = (typeof SPONSORBLOCK_SKIP_CATEGORIES)[number];

export type SponsorBlockCategoryMode = "auto" | "button" | "off";

export type SponsorBlockCategoryStats = {
  appearances: number;
  manualSkips: number;
  undoSignals: number;
};

export type SponsorBlockSegment = {
  segment: [number, number];
  UUID: string;
  category: string;
  actionType: string;
  locked?: number;
  votes?: number;
  videoDuration?: number;
  description?: string;
};

export type SponsorBlockSidecar = {
  videoId: string;
  fetchedAt: string;
  api: string;
  segments: SponsorBlockSegment[];
};

const SKIP_SET = new Set<string>(SPONSORBLOCK_SKIP_CATEGORIES);

export function isSkipCategory(cat: string): cat is SponsorBlockSkipCategory {
  return SKIP_SET.has(cat);
}

export function categoryLabel(cat: SponsorBlockSkipCategory): string {
  const labels: Record<SponsorBlockSkipCategory, string> = {
    sponsor: "Sponsor",
    selfpromo: "Self-promo",
    interaction: "Interaction",
    intro: "Intro",
    outro: "Outro",
    preview: "Preview",
    filler: "Filler",
  };
  return labels[cat];
}

export function defaultCategoryModes(): Record<
  SponsorBlockSkipCategory,
  SponsorBlockCategoryMode
> {
  return Object.fromEntries(
    SPONSORBLOCK_SKIP_CATEGORIES.map((c) => [c, "button"]),
  ) as Record<SponsorBlockSkipCategory, SponsorBlockCategoryMode>;
}

export function defaultCategoryStats(): Record<
  SponsorBlockSkipCategory,
  SponsorBlockCategoryStats
> {
  return Object.fromEntries(
    SPONSORBLOCK_SKIP_CATEGORIES.map((c) => [
      c,
      { appearances: 0, manualSkips: 0, undoSignals: 0 },
    ]),
  ) as Record<SponsorBlockSkipCategory, SponsorBlockCategoryStats>;
}

export function mergeCategoryModes(
  raw: Partial<Record<SponsorBlockSkipCategory, SponsorBlockCategoryMode>> | undefined,
): Record<SponsorBlockSkipCategory, SponsorBlockCategoryMode> {
  const base = defaultCategoryModes();
  if (!raw) return base;
  for (const c of SPONSORBLOCK_SKIP_CATEGORIES) {
    const m = raw[c];
    if (m === "auto" || m === "button" || m === "off") base[c] = m;
  }
  return base;
}

export function mergeCategoryStats(
  raw: Partial<Record<SponsorBlockSkipCategory, SponsorBlockCategoryStats>> | undefined,
): Record<SponsorBlockSkipCategory, SponsorBlockCategoryStats> {
  const base = defaultCategoryStats();
  if (!raw) return base;
  for (const c of SPONSORBLOCK_SKIP_CATEGORIES) {
    const s = raw[c];
    if (!s || typeof s !== "object") continue;
    base[c] = {
      appearances: finiteNonNeg(s.appearances),
      manualSkips: finiteNonNeg(s.manualSkips),
      undoSignals: finiteNonNeg(s.undoSignals),
    };
  }
  return base;
}

function finiteNonNeg(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Learned effective mode when user tri-state is `button` (default path). */
export function learnedCategoryMode(
  stats: SponsorBlockCategoryStats,
): "auto" | "button" {
  const { appearances, manualSkips, undoSignals } = stats;
  if (undoSignals >= SB_DEMOTE_UNDO_SIGNALS) return "button";
  if (
    appearances >= SB_GRADUATE_MIN_APPEARANCES &&
    manualSkips >= SB_GRADUATE_MIN_MANUAL_SKIPS &&
    appearances > 0 &&
    manualSkips / appearances >= SB_GRADUATE_MIN_SKIP_RATE
  ) {
    return "auto";
  }
  return "button";
}

export function effectiveCategoryMode(
  settings: RuforgeSettings,
  cat: SponsorBlockSkipCategory,
): SponsorBlockCategoryMode {
  const user = settings.sponsorBlockCategoryModes?.[cat] ?? "button";
  if (user === "auto" || user === "off") return user;
  const stats = settings.sponsorBlockCategoryStats?.[cat] ?? {
    appearances: 0,
    manualSkips: 0,
    undoSignals: 0,
  };
  return learnedCategoryMode(stats);
}

export function effectiveModeBadge(
  settings: RuforgeSettings,
  cat: SponsorBlockSkipCategory,
): string {
  const user = settings.sponsorBlockCategoryModes?.[cat] ?? "button";
  const effective = effectiveCategoryMode(settings, cat);
  if (user === "auto") return "Auto-skip";
  if (user === "off") return "Off";
  if (user === "button" && effective === "auto") return "Learned: auto-skip";
  return "Show button";
}

export function segmentAtTime(
  segments: SponsorBlockSegment[],
  t: number,
  predicate: (s: SponsorBlockSegment) => boolean,
): SponsorBlockSegment | null {
  for (const s of segments) {
    if (!predicate(s)) continue;
    const [a, b] = s.segment;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (t >= a && t < b) return s;
  }
  return null;
}

export function activeSkipSegments(
  segments: SponsorBlockSegment[],
  t: number,
): SponsorBlockSegment[] {
  return segments.filter((s) => {
    if (!isSkipCategory(s.category) || s.actionType !== "skip") return false;
    const [a, b] = s.segment;
    return Number.isFinite(a) && Number.isFinite(b) && t >= a && t < b;
  });
}

export function skipSeekTarget(segments: SponsorBlockSegment[], t: number): number | null {
  const active = activeSkipSegments(segments, t);
  if (active.length === 0) return null;
  return Math.max(...active.map((s) => s.segment[1]));
}

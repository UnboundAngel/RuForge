/** Official SponsorBlock extension bar colors (barTypes). */
export const SPONSORBLOCK_CATEGORY_COLORS: Record<string, string> = {
  sponsor: "#00D400",
  selfpromo: "#FFFF00",
  interaction: "#CC00FF",
  intro: "#00FFFF",
  outro: "#0080FF",
  preview: "#008FD6",
  filler: "#7300FF",
  music_offtopic: "#FF9900",
  poi_highlight: "#FF1684",
  chapter: "#FFC83D",
  exclusive_access: "#008a5c",
};

/** Scrub overlay opacity from extension barTypes (all categories). */
export const SPONSORBLOCK_BAR_OPACITY = 0.7;

function contrastingTextOnHex(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#000000" : "#ffffff";
}

export function sbSegmentColor(category: string, actionType: string): string | null {
  if (actionType === "chapter" || category === "chapter") {
    return SPONSORBLOCK_CATEGORY_COLORS.chapter;
  }
  if (actionType === "poi" || category === "poi_highlight") {
    return SPONSORBLOCK_CATEGORY_COLORS.poi_highlight;
  }
  if (category in SPONSORBLOCK_CATEGORY_COLORS) {
    return SPONSORBLOCK_CATEGORY_COLORS[category];
  }
  return null;
}

export function sbScrubRangeStyle(
  category: string,
  actionType: string,
): { backgroundColor: string; opacity: number } | null {
  const color = sbSegmentColor(category, actionType);
  if (!color) return null;

  return {
    backgroundColor: color,
    opacity: SPONSORBLOCK_BAR_OPACITY,
  };
}

/** Pill under scrub hover preview (solid category fill, contrasting label). */
export function sbScrubPillStyle(category: string): {
  backgroundColor: string;
  color: string;
} {
  const actionType =
    category === "chapter" ? "chapter" : category === "poi_highlight" ? "poi" : "skip";
  const accent = sbSegmentColor(category, actionType) ?? "#a8a8a8";
  return {
    backgroundColor: accent,
    color: contrastingTextOnHex(accent),
  };
}

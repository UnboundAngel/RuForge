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
};

/** Scrub overlay opacity from extension barTypes (all categories). */
export const SPONSORBLOCK_BAR_OPACITY = 0.7;

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

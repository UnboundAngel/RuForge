export const SPONSORBLOCK_CATEGORY_COLORS: Record<string, string> = {
  sponsor: "#00D400",
  selfpromo: "#FFFF00",
  interaction: "#CC00FF",
  intro: "#00FFFF",
  outro: "#0080FF",
  preview: "#008FD6",
  filler: "#7300FF",
  chapter: "#F59E0B",
  poi_highlight: "#EAB308",
};

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

export function sbScrubRangeStyle(category: string, actionType: string): { backgroundColor: string; opacity: number } | null {
  const color = sbSegmentColor(category, actionType);
  if (!color) return null;

  // Sponsor segment can be slightly less opaque for clean overlays, e.g., 0.35
  const opacity = category === "sponsor" ? 0.35 : 0.3;
  return {
    backgroundColor: color,
    opacity,
  };
}

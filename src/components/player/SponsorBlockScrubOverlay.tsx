import React from "react";
import { sbScrubRangeStyle, sbSegmentColor } from "../../sponsorBlockColors";

type ScrubOverlayProps = {
  duration: number;
  overlay: {
    skipRanges: { start: number; end: number; category: string }[];
    chapterRanges: { start: number; end: number }[];
    poiTimes: { time: number; description?: string }[];
  };
};

export const SponsorBlockScrubOverlay: React.FC<ScrubOverlayProps> = ({
  duration,
  overlay,
}) => {
  if (!duration || duration <= 0) return null;

  const { skipRanges, chapterRanges, poiTimes } = overlay;

  return (
    <div className="absolute inset-0 pointer-events-none z-[5] overflow-visible">
      {/* Skip Ranges */}
      {skipRanges.map((r, i) => {
        const rangeStyle = sbScrubRangeStyle(r.category, "skip");
        if (!rangeStyle) return null;

        const leftPct = (r.start / duration) * 100;
        const widthPct = Math.max(0, ((r.end - r.start) / duration) * 100);

        return (
          <div
            key={`sb-skip-range-${i}`}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: rangeStyle.backgroundColor,
              opacity: rangeStyle.opacity,
            }}
          />
        );
      })}

      {/* Chapter Ranges */}
      {chapterRanges.map((r, i) => {
        const rangeStyle = sbScrubRangeStyle("chapter", "chapter");
        if (!rangeStyle) return null;

        const leftPct = (r.start / duration) * 100;
        const widthPct = Math.max(0, ((r.end - r.start) / duration) * 100);

        return (
          <div
            key={`sb-chapter-range-${i}`}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: rangeStyle.backgroundColor,
              opacity: rangeStyle.opacity,
            }}
          />
        );
      })}

      {/* POI Highlight Ticks */}
      {poiTimes.map((p, i) => {
        const tickColor = sbSegmentColor("poi_highlight", "poi") || "#FF1684";
        const leftPct = (p.time / duration) * 100;

        return (
          <div
            key={`sb-poi-tick-${i}`}
            className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 opacity-90 z-[7] pointer-events-none rounded-sm"
            style={{
              left: `${leftPct}%`,
              backgroundColor: tickColor,
            }}
            title={p.description || "Highlight"}
          />
        );
      })}
    </div>
  );
};

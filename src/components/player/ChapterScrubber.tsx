import { useMemo } from "react";
import { AnimatePresence } from "motion/react";
import {
  bufferedPercentInChapter,
  chapterAtHoverPercent,
  chapterAtTime,
  chapterGridTemplateColumns,
  hoverPercentInChapter,
  type NormalizedChapter,
} from "../../chapters";
import { ScrubHoverPreview } from "./ScrubHoverPreview";
import type { ScrubBarOverlay } from "../../sponsorBlock";
import { sbScrubRangeStyle, sbSegmentColor } from "../../sponsorBlockColors";

const BASE_TRACK_H = 6; // px, matches h-1.5
const HOVER_SCALE = 2; // visual height multiplier for hovered segment only

type ChapterScrubberProps = {
  chapters: NormalizedChapter[];
  duration: number;
  currentTime: number;
  bufferedPercent: number;
  playedPercent: number;
  hoverPercent: number | null;
  isHovering: boolean;
  isScrubbing: boolean;
  scrubberThumbs: string[];
  formatTime: (time: number) => string;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: () => void;
  overlay?: ScrubBarOverlay;
};

export function ChapterScrubber({
  chapters,
  duration,
  currentTime,
  bufferedPercent,
  playedPercent,
  hoverPercent,
  isHovering,
  isScrubbing,
  scrubberThumbs,
  formatTime,
  onMouseDown,
  onMouseMove,
  onMouseLeave,
  overlay,
}: ChapterScrubberProps) {
  const gridCols = useMemo(
    () => chapterGridTemplateColumns(chapters, duration),
    [chapters, duration],
  );
  const hoverChapter =
    hoverPercent !== null && isFinite(duration) && duration > 0
      ? chapterAtHoverPercent(chapters, duration, hoverPercent)
      : null;
  const hoverTimeSec =
    hoverPercent !== null && isFinite(duration) && duration > 0
      ? (hoverPercent / 100) * duration
      : 0;
  const at = useMemo(
    () => chapterAtTime(chapters, currentTime),
    [chapters, currentTime],
  );
  const activeHoverIndex = hoverChapter?.index ?? -1;
  const playheadOnHoveredSegment =
    isHovering && at !== null && at.index === activeHoverIndex;
  const trackVisualH = playheadOnHoveredSegment
    ? BASE_TRACK_H * HOVER_SCALE
    : BASE_TRACK_H;
  const knobCenterFromBottom = trackVisualH / 2;

  return (
    <div
      className="w-full min-w-0 max-w-full relative overflow-visible"
      style={{ height: isHovering ? BASE_TRACK_H * HOVER_SCALE : BASE_TRACK_H }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="grid w-full min-w-0 gap-[3px] items-end absolute inset-x-0 bottom-0 overflow-visible"
        style={{ gridTemplateColumns: gridCols, height: BASE_TRACK_H }}
      >
        {chapters.map((ch, i) => {
          const isPast = at ? i < at.index : false;
          const isFuture = at ? i > at.index : true;
          const localPlayed =
            at?.index === i ? at.localProgress01 * 100 : isPast ? 100 : 0;
          const localBuffered = bufferedPercentInChapter(
            ch,
            bufferedPercent,
            duration,
          );
          const localHover =
            isHovering && hoverPercent !== null
              ? hoverPercentInChapter(ch, hoverPercent, duration)
              : 0;
          const isHoveredChapter = isHovering && i === activeHoverIndex;

          const chDuration = ch.end_time - ch.start_time;

          // Compute SponsorBlock skips overlapping with this chapter
          const sbSkips = overlay?.skipRanges
            ? overlay.skipRanges
                .map((r) => {
                  const overlapStart = Math.max(r.start, ch.start_time);
                  const overlapEnd = Math.min(r.end, ch.end_time);
                  if (overlapEnd > overlapStart && chDuration > 0) {
                    const leftPct = ((overlapStart - ch.start_time) / chDuration) * 100;
                    const widthPct = ((overlapEnd - overlapStart) / chDuration) * 100;
                    const rangeStyle = sbScrubRangeStyle(r.category, "skip");
                    if (rangeStyle) {
                      return { leftPct, widthPct, color: rangeStyle.backgroundColor, opacity: rangeStyle.opacity };
                    }
                  }
                  return null;
                })
                .filter(Boolean)
            : [];

          // Compute SponsorBlock chapters overlapping with this chapter
          const sbChaps = overlay?.chapterRanges
            ? overlay.chapterRanges
                .map((r) => {
                  const overlapStart = Math.max(r.start, ch.start_time);
                  const overlapEnd = Math.min(r.end, ch.end_time);
                  if (overlapEnd > overlapStart && chDuration > 0) {
                    const leftPct = ((overlapStart - ch.start_time) / chDuration) * 100;
                    const widthPct = ((overlapEnd - overlapStart) / chDuration) * 100;
                    const rangeStyle = sbScrubRangeStyle("chapter", "chapter");
                    if (rangeStyle) {
                      return { leftPct, widthPct, color: rangeStyle.backgroundColor, opacity: rangeStyle.opacity };
                    }
                  }
                  return null;
                })
                .filter(Boolean)
            : [];

          // Compute SponsorBlock POIs inside this chapter
          const sbPois = overlay?.poiTimes
            ? overlay.poiTimes
                .map((p) => {
                  if (p.time >= ch.start_time && p.time <= ch.end_time && chDuration > 0) {
                    const leftPct = ((p.time - ch.start_time) / chDuration) * 100;
                    const tickColor = sbSegmentColor("poi_highlight", "poi") || "#FF1684";
                    return { leftPct, color: tickColor };
                  }
                  return null;
                })
                .filter(Boolean)
            : [];

          return (
            <div
              key={`${ch.start_time}-${i}`}
              className={`relative min-w-0 rounded-full bg-white/15 overflow-hidden ${
                isHoveredChapter ? "z-20" : "z-0"
              }`}
              style={{
                height: BASE_TRACK_H,
                transform: isHoveredChapter
                  ? `scaleY(${HOVER_SCALE})`
                  : undefined,
                transformOrigin: "bottom center",
              }}
            >
              {/* SponsorBlock skip ranges inside chapter capsule */}
              {sbSkips.map((s, idx) => s && (
                <div
                  key={`sb-skip-${idx}`}
                  className="absolute top-0 bottom-0 pointer-events-none z-[1]"
                  style={{
                    left: `${s.leftPct}%`,
                    width: `${s.widthPct}%`,
                    backgroundColor: s.color,
                    opacity: s.opacity,
                  }}
                />
              ))}

              {/* SponsorBlock chapter ranges inside chapter capsule */}
              {sbChaps.map((s, idx) => s && (
                <div
                  key={`sb-chap-${idx}`}
                  className="absolute top-0 bottom-0 pointer-events-none z-[1]"
                  style={{
                    left: `${s.leftPct}%`,
                    width: `${s.widthPct}%`,
                    backgroundColor: s.color,
                    opacity: s.opacity,
                  }}
                />
              ))}

              {/* SponsorBlock POI vertical tick lines (no dots!) inside chapter capsule */}
              {sbPois.map((p, idx) => p && (
                <div
                  key={`sb-poi-${idx}`}
                  className="absolute top-0 bottom-0 w-[2.5px] -translate-x-1/2 opacity-95 z-[3] pointer-events-none rounded-sm"
                  style={{
                    left: `${p.leftPct}%`,
                    backgroundColor: p.color,
                  }}
                />
              ))}

              <div
                className="absolute top-0 left-0 h-full bg-white/25 rounded-full pointer-events-none"
                style={{ width: `${isFuture ? 0 : localBuffered}%` }}
              />
              <div
                className="absolute top-0 left-0 h-full bg-[#271C18] rounded-full shadow-[0_0_10px_rgba(39,28,24,0.4)] pointer-events-none"
                style={{ width: `${localPlayed}%` }}
              />
              {localHover > 0 && (
                <div
                  className="absolute top-0 left-0 h-full bg-white/10 rounded-full pointer-events-none"
                  style={{ width: `${localHover}%` }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div
        className={`absolute -translate-x-1/2 w-4 h-4 bg-white rounded-full border-2 border-[#271C18] shadow-lg pointer-events-none z-30 transition-[opacity,bottom] duration-150 ${
          isHovering || isScrubbing ? "opacity-100" : "opacity-0"
        }`}
        style={{
          left: `${playedPercent}%`,
          bottom: knobCenterFromBottom,
          transform: "translate(-50%, 50%)",
        }}
      />

      <AnimatePresence>
        {isHovering &&
          isFinite(duration) &&
          duration > 0 &&
          hoverPercent !== null && (
            <ScrubHoverPreview
              hoverTimeSec={hoverTimeSec}
              duration={duration}
              spritePaths={scrubberThumbs}
              chapterTitle={hoverChapter?.chapter.title ?? ""}
              chapterKey={hoverChapter?.index ?? -1}
              showChapterTitle={hoverChapter != null}
              formatTime={formatTime}
              cursorPercent={hoverPercent}
              sbOverlay={overlay}
            />
          )}
      </AnimatePresence>
    </div>
  );
}

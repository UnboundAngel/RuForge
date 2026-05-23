import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ScrubberHoverThumb } from "../../scrubSpritePreview";
import { MarqueeText } from "../downloader/DownloadJobQueuePanel";
import {
  activeScrubSegmentAtTime,
  type ScrubBarOverlay,
} from "../../sponsorBlock";
import { sbScrubPillStyle } from "../../sponsorBlockColors";

const THUMB_FRAME_PAD = 8;

const EMPTY_OVERLAY: ScrubBarOverlay = {
  skipRanges: [],
  chapterRanges: [],
  poiTimes: [],
};

type ScrubHoverPreviewProps = {
  hoverTimeSec: number;
  duration: number;
  spritePaths: string[];
  formatTime: (time: number) => string;
  /** 0..100, horizontal position on the scrubber */
  cursorPercent: number;
  thumbWidth?: number;
  chapterTitle?: string;
  chapterKey?: number;
  showChapterTitle?: boolean;
  sbOverlay?: ScrubBarOverlay;
};

function SponsorBlockSegmentPill({
  category,
  label,
  pillKey,
}: {
  category: string;
  label: string;
  pillKey: string;
}) {
  const style = sbScrubPillStyle(category);

  return (
    <motion.div
      key={pillKey}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 2 }}
      transition={{ duration: 0.08 }}
      className="w-full flex justify-center shrink-0 px-1"
    >
      <span
        className="inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide shadow-xl backdrop-blur-md"
        style={{
          borderColor: style.borderColor,
          backgroundColor: style.backgroundColor,
          color: style.color,
        }}
      >
        <span className="truncate">{label}</span>
      </span>
    </motion.div>
  );
}

export function ScrubHoverPreview({
  hoverTimeSec,
  duration,
  spritePaths,
  formatTime,
  cursorPercent,
  thumbWidth = 192,
  chapterTitle = "",
  chapterKey = -1,
  showChapterTitle = false,
  sbOverlay,
}: ScrubHoverPreviewProps) {
  const hasThumb = spritePaths.length > 0;
  const overlay = sbOverlay ?? EMPTY_OVERLAY;
  const activeSegment = useMemo(
    () => activeScrubSegmentAtTime(hoverTimeSec, duration, overlay),
    [hoverTimeSec, duration, overlay],
  );
  const halfThumb = thumbWidth / 2;

  const cardW = hasThumb ? thumbWidth + THUMB_FRAME_PAD * 2 : undefined;
  const clampHalf = hasThumb ? (cardW ?? thumbWidth) / 2 : halfThumb;
  const titleMaxW = hasThumb && cardW ? Math.max(72, cardW - 76) : 200;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: 0.1 }}
      className="absolute bottom-full z-[100] pointer-events-none -translate-x-1/2 mb-5"
      style={{
        left: `clamp(${clampHalf}px, ${cursorPercent}%, calc(100% - ${clampHalf}px))`,
        ...(cardW
          ? {
              width: cardW,
              maxWidth: `min(${cardW}px, calc(100vw - 24px))`,
            }
          : {}),
      }}
    >
      <motion.div
        className={`flex flex-col items-center min-w-0 gap-1.5 ${cardW ? "w-full" : ""}`}
      >
        {hasThumb && cardW && (
          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl overflow-hidden p-2">
            <ScrubberHoverThumb
              hoverTimeSec={hoverTimeSec}
              duration={duration}
              spritePaths={spritePaths}
              displayWidth={thumbWidth}
              className="rounded-lg"
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeSegment && (
            <SponsorBlockSegmentPill
              category={activeSegment.category}
              label={activeSegment.label}
              pillKey={activeSegment.key}
            />
          )}
        </AnimatePresence>

        <motion.div className="flex w-max max-w-full shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/85 backdrop-blur-md px-3 py-1.5 shadow-xl">
          <span className="text-[12px] font-bold tabular-nums text-white shrink-0">
            {formatTime(hoverTimeSec)}
          </span>
          {showChapterTitle && chapterTitle.trim() && (
            <>
              <span className="w-px h-3.5 bg-white/20 shrink-0" aria-hidden />
              <motion.div className="min-w-0 shrink" style={{ maxWidth: titleMaxW }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={chapterKey}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.08 }}
                  >
                    <MarqueeText
                      text={chapterTitle}
                      layoutKey={chapterKey}
                      className="text-[11px] font-semibold text-white/95"
                    />
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

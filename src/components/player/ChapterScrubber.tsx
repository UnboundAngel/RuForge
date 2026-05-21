import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  bufferedPercentInChapter,
  chapterAtHoverPercent,
  chapterAtTime,
  chapterGridTemplateColumns,
  hoverPercentInChapter,
  type NormalizedChapter,
} from "../../chapters";
import { ScrubberHoverThumb } from "../../scrubSpritePreview";
import { MarqueeText } from "../downloader/DownloadJobQueuePanel";

const THUMB_W = 192;
const THUMB_FRAME_PAD = 8; // p-2 per side
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
};

function ChapterScrubPreview({
  hoverTimeSec,
  duration,
  spritePaths,
  chapterTitle,
  chapterKey,
  formatTime,
  cursorPercent,
}: {
  hoverTimeSec: number;
  duration: number;
  spritePaths: string[];
  chapterTitle: string;
  chapterKey: number;
  formatTime: (time: number) => string;
  cursorPercent: number;
}) {
  const hasThumb = spritePaths.length > 0;
  const halfThumb = THUMB_W / 2;

  const cardW = hasThumb ? THUMB_W + THUMB_FRAME_PAD * 2 : undefined;
  const clampHalf = hasThumb ? (cardW ?? THUMB_W) / 2 : halfThumb;
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
      <div
        className={`flex flex-col items-center min-w-0 gap-1.5 ${cardW ? "w-full" : ""}`}
      >
        {hasThumb && cardW && (
          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl overflow-hidden p-2">
            <ScrubberHoverThumb
              hoverTimeSec={hoverTimeSec}
              duration={duration}
              spritePaths={spritePaths}
              displayWidth={THUMB_W}
              className="rounded-lg"
            />
          </div>
        )}
        <div className="flex w-max max-w-full shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/85 backdrop-blur-md px-3 py-1.5 shadow-xl">
          <span className="text-[12px] font-bold tabular-nums text-white shrink-0">
            {formatTime(hoverTimeSec)}
          </span>
          <span className="w-px h-3.5 bg-white/20 shrink-0" aria-hidden />
          <div
            className="min-w-0 shrink"
            style={{ maxWidth: titleMaxW }}
          >
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
          </div>
        </div>
      </div>
    </motion.div>
  );
}

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
          hoverPercent !== null &&
          hoverChapter && (
            <ChapterScrubPreview
              hoverTimeSec={hoverTimeSec}
              duration={duration}
              spritePaths={scrubberThumbs}
              chapterTitle={hoverChapter.chapter.title}
              chapterKey={hoverChapter.index}
              formatTime={formatTime}
              cursorPercent={hoverPercent}
            />
          )}
      </AnimatePresence>
    </div>
  );
}

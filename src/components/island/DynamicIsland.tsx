import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { ActivityIslandWaveform } from "./ActivityIslandWaveform";
import {
  AirplayIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "./islandIcons";

export type IslandState = "idle" | "compact" | "expanded";

const ISLAND_SPRING = {
  type: "spring" as const,
  stiffness: 350,
  damping: 27,
  mass: 0.8,
};

const ISLAND_DIMENSIONS: Record<
  IslandState,
  { width: number; height: number; borderRadius: number }
> = {
  idle: { width: 120, height: 36, borderRadius: 18 },
  compact: { width: 220, height: 36, borderRadius: 18 },
  expanded: { width: 350, height: 184, borderRadius: 40 },
};

export type DynamicIslandContent = {
  coverSrc: string | null;
  title: string;
  subtitle: string | null;
  stubLabel: string | null;
  paused: boolean;
  waveformPaused: boolean;
  accentColor: string;
  currentTime: number;
  duration: number;
  progress: number;
  showSkip: boolean;
  showExpandedControls: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  isStub: boolean;
  canSeek: boolean;
};

type DynamicIslandProps = {
  state: IslandState;
  content: DynamicIslandContent;
  waveformLevels: readonly number[];
  onClick: () => void;
  onPlayPause: (e: MouseEvent) => void;
  onSeekProgress?: (e: MouseEvent<HTMLDivElement>) => void;
  onOpenPlayer?: (e: MouseEvent) => void;
  onSkipPrev?: (e: MouseEvent) => void;
  onSkipNext?: (e: MouseEvent) => void;
};

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function CoverArt({ src, size }: { src: string | null; size: "compact" | "expanded" }) {
  if (!src) {
    return (
      <div
        className={`shrink-0 overflow-hidden bg-white/10 ${
          size === "expanded" ? "w-16 h-16 rounded-2xl shadow-lg" : "w-6 h-6 rounded-full"
        }`}
      />
    );
  }

  if (size === "expanded") {
    return (
      <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 shadow-lg">
        <img src={src} alt="" className="w-full h-full object-cover scale-110" />
      </div>
    );
  }

  return (
    <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
      <img src={src} alt="" className="w-full h-full object-cover" />
    </div>
  );
}

function ContentShell({
  children,
  enterScale = 0.8,
}: {
  children: ReactNode;
  enterScale?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: enterScale }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, delay: 0.1 } }}
      exit={{ opacity: 0, scale: enterScale, transition: { duration: 0.15 } }}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  );
}

function IdleContent() {
  return (
    <ContentShell>
      <div className="flex h-full items-center justify-center pointer-events-none" />
    </ContentShell>
  );
}

function CompactContent({
  content,
  waveformLevels,
}: {
  content: DynamicIslandContent;
  waveformLevels: readonly number[];
}) {
  return (
    <ContentShell>
      <div className="flex h-full items-center justify-between px-2 pointer-events-none">
        <CoverArt src={content.coverSrc} size="compact" />
        <ActivityIslandWaveform
          levels={waveformLevels}
          coverSrc={content.coverSrc}
          accentColor={content.accentColor}
          muted={content.isStub}
          className="mr-2"
        />
      </div>
    </ContentShell>
  );
}

function ExpandedContent({
  content,
  waveformLevels,
  onPlayPause,
  onSeekProgress,
  onOpenPlayer,
  onSkipPrev,
  onSkipNext,
}: {
  content: DynamicIslandContent;
  waveformLevels: readonly number[];
  onPlayPause: (e: MouseEvent) => void;
  onSeekProgress?: (e: MouseEvent<HTMLDivElement>) => void;
  onOpenPlayer?: (e: MouseEvent) => void;
  onSkipPrev?: (e: MouseEvent) => void;
  onSkipNext?: (e: MouseEvent) => void;
}) {
  const remaining =
    content.duration > 0
      ? `-${formatClock(Math.max(0, content.duration - content.currentTime))}`
      : "0:00";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.1 } }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      className="absolute inset-0 flex flex-col justify-between p-5 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-4 px-1">
        <CoverArt src={content.coverSrc} size="expanded" />
        <div className="min-w-0 flex flex-col justify-center">
          <span className="truncate text-white font-medium text-[17px] leading-tight">
            {content.title}
          </span>
          {content.subtitle ? (
            <span className="truncate text-zinc-400 text-[15px] pt-1">{content.subtitle}</span>
          ) : null}
          {content.isStub && content.stubLabel ? (
            <span className="truncate text-zinc-500 text-[13px] pt-1 uppercase tracking-wide">
              {content.stubLabel}
            </span>
          ) : null}
        </div>
        <div className="ml-auto self-start mt-2 mr-1">
          <ActivityIslandWaveform
            levels={waveformLevels}
            coverSrc={content.coverSrc}
            accentColor={content.accentColor}
            muted={content.isStub}
          />
        </div>
      </div>

      {content.showExpandedControls ? (
        <>
          <div className="flex items-center gap-3 text-[13px] text-zinc-400 px-1 mt-3">
            <span className="tabular-nums">{formatClock(content.currentTime)}</span>
            <div
              className={`h-2 flex-1 overflow-hidden rounded-full bg-zinc-800 ${
                content.canSeek ? "cursor-pointer" : ""
              }`}
              onClick={content.canSeek ? onSeekProgress : undefined}
            >
              <div
                className="h-full rounded-full bg-white transition-[width] duration-150"
                style={{ width: `${content.progress}%` }}
              />
            </div>
            <span className="tabular-nums">{remaining}</span>
          </div>

          <div className="relative flex items-center justify-center gap-8 mt-2 mb-1">
            {content.showSkip ? (
              <button
                type="button"
                disabled={!content.hasPrev}
                className="text-zinc-100 hover:text-white transition-colors disabled:opacity-30"
                onClick={onSkipPrev}
                aria-label="Previous"
              >
                <SkipBackIcon className="w-7 h-7" />
              </button>
            ) : null}
            <button
              type="button"
              className="text-white hover:scale-105 transition-transform"
              onClick={onPlayPause}
              aria-label={content.paused ? "Play" : "Pause"}
            >
              {content.paused ? (
                <PlayIcon className="w-10 h-10" />
              ) : (
                <PauseIcon className="w-10 h-10" />
              )}
            </button>
            {content.showSkip ? (
              <button
                type="button"
                disabled={!content.hasNext}
                className="text-zinc-100 hover:text-white transition-colors disabled:opacity-30"
                onClick={onSkipNext}
                aria-label="Next"
              >
                <SkipForwardIcon className="w-7 h-7" />
              </button>
            ) : null}
            <button
              type="button"
              className="absolute right-1 bottom-1 text-zinc-400 hover:text-white transition-colors"
              aria-label="Open player"
              onClick={onOpenPlayer}
            >
              <AirplayIcon className="w-5 h-5" />
            </button>
          </div>
        </>
      ) : null}
    </motion.div>
  );
}

export function DynamicIsland({
  state,
  content,
  waveformLevels,
  onClick,
  onPlayPause,
  onSeekProgress,
  onOpenPlayer,
  onSkipPrev,
  onSkipNext,
}: DynamicIslandProps) {
  const dims = ISLAND_DIMENSIONS[state];
  const interactive = state !== "idle";

  return (
    <motion.div
      initial={false}
      animate={dims}
      transition={ISLAND_SPRING}
      style={{ originY: 0, WebkitAppRegion: "no-drag" } as CSSProperties}
      className="pointer-events-auto relative"
      onClick={onClick}
    >
      <div
        className={`relative h-full w-full overflow-hidden bg-black ${
          state === "expanded" ? "shadow-2xl" : ""
        } ${interactive ? "cursor-pointer" : "cursor-default"}`}
        style={{ borderRadius: dims.borderRadius }}
      >
        <AnimatePresence initial={false}>
          {state === "idle" && <IdleContent key="idle" />}
          {state === "compact" && (
            <CompactContent key="compact" content={content} waveformLevels={waveformLevels} />
          )}
          {state === "expanded" && (
            <ExpandedContent
              key="expanded"
              content={content}
              waveformLevels={waveformLevels}
              onPlayPause={onPlayPause}
              onSeekProgress={onSeekProgress}
              onOpenPlayer={onOpenPlayer}
              onSkipPrev={onSkipPrev}
              onSkipNext={onSkipNext}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { ActivityIslandWaveform } from "./ActivityIslandWaveform";
import { IslandExpandedContent } from "./IslandExpandedContent";

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
  /** Stable per-track identity (file path) for resetting scrub state on track change. */
  trackKey: string;
  title: string;
  subtitle: string | null;
  stubLabel: string | null;
  paused: boolean;
  waveformPaused: boolean;
  accentColor: string;
  currentTime: number;
  duration: number;
  progress: number;
  showTrackSkip: boolean;
  showExpandedControls: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  isStub: boolean;
  canSeek: boolean;
  isMuted: boolean;
  volume: number;
  isLooping: boolean;
};

type DynamicIslandProps = {
  state: IslandState;
  content: DynamicIslandContent;
  waveformLevels: readonly number[];
  onClick: () => void;
  onPlayPause: (e: MouseEvent) => void;
  onSeek?: (seconds: number) => void;
  onBeginScrub?: () => void;
  onReleaseScrub?: (seconds: number) => void;
  onOpenPlayer?: (e: MouseEvent) => void;
  onSkipPrev?: (e: MouseEvent) => void;
  onSkipNext?: (e: MouseEvent) => void;
  onSkipBySeconds?: (delta: number) => (e: MouseEvent) => void;
  onVolume?: (v: number) => void;
  onMuted?: (m: boolean) => void;
  onToggleLoop?: (e: MouseEvent) => void;
  onPopOut?: (e: MouseEvent) => void;
};

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
      <div className="pointer-events-none flex h-full items-center justify-center" />
    </ContentShell>
  );
}

function CoverArt({ src }: { src: string | null }) {
  if (!src) {
    return <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white/10" />;
  }

  return (
    <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
      <img src={src} alt="" className="h-full w-full object-cover" />
    </div>
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
      <div className="pointer-events-none flex h-full items-center justify-between px-2">
        <CoverArt src={content.coverSrc} />
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

export function DynamicIsland({
  state,
  content,
  waveformLevels,
  onClick,
  onPlayPause,
  onSeek,
  onBeginScrub,
  onReleaseScrub,
  onOpenPlayer,
  onSkipPrev,
  onSkipNext,
  onSkipBySeconds,
  onVolume,
  onMuted,
  onToggleLoop,
  onPopOut,
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
        className={`rf-island-shell relative h-full w-full ${
          state === "expanded" ? "overflow-visible shadow-2xl" : "overflow-hidden"
        } ${interactive ? "cursor-pointer" : "cursor-default"}`}
        style={{ borderRadius: dims.borderRadius }}
      >
        <AnimatePresence initial={false}>
          {state === "idle" && <IdleContent key="idle" />}
          {state === "compact" && (
            <CompactContent key="compact" content={content} waveformLevels={waveformLevels} />
          )}
          {state === "expanded" && (
            <IslandExpandedContent
              key="expanded"
              content={content}
              waveformLevels={waveformLevels}
              onPlayPause={onPlayPause}
              onSeek={onSeek}
              onBeginScrub={onBeginScrub}
              onReleaseScrub={onReleaseScrub}
              onOpenPlayer={onOpenPlayer}
              onSkipPrev={onSkipPrev}
              onSkipNext={onSkipNext}
              onSkipBySeconds={onSkipBySeconds}
              onVolume={onVolume}
              onMuted={onMuted}
              onToggleLoop={onToggleLoop}
              onPopOut={onPopOut}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

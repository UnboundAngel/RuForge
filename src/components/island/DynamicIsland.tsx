import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { ActivityIslandWaveform } from "./ActivityIslandWaveform";
import {
  IslandCaptureSavedContent,
  captureIslandWidthForCaption,
} from "./IslandCaptureSavedContent";
import { IslandIdleDevCaptureContent } from "./IslandIdleDevCaptureContent";
import { IslandExpandedContent } from "./IslandExpandedContent";
import {
  IslandUpdateCompactContent,
  IslandUpdateExpandedContent,
  islandUpdateCollapsedWidth,
  type IslandUpdateContentProps,
} from "./IslandUpdateContent";

export type IslandState = "idle" | "compact" | "expanded" | "capture";

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
  capture: { width: 160, height: 36, borderRadius: 18 },
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
  devCaptureIdle?: {
    hover: boolean;
    busy: boolean;
    onCapture: (e: MouseEvent) => void;
  };
  captureSavedCaption?: string;
  captureSavedPreviewSrc?: string;
  onCaptureSavedOpen?: (e: MouseEvent) => void;
  updateAvailable?: Omit<IslandUpdateContentProps, "compact"> & { collapsed: boolean };
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
  devCaptureIdle,
  captureSavedCaption,
  captureSavedPreviewSrc,
  onCaptureSavedOpen,
  updateAvailable,
}: DynamicIslandProps) {
  const updateMode = Boolean(updateAvailable);
  const effectiveState: IslandState = updateMode
    ? updateAvailable!.collapsed
      ? "idle"
      : "expanded"
    : state;
  const baseDims = ISLAND_DIMENSIONS[effectiveState];
  const dims =
    updateMode && updateAvailable?.collapsed
      ? {
          width: islandUpdateCollapsedWidth(updateAvailable.selectedVersion),
          height: 36,
          borderRadius: 18,
        }
      : effectiveState === "capture" && captureSavedCaption
        ? { ...baseDims, width: captureIslandWidthForCaption(captureSavedCaption) }
        : baseDims;
  const interactive = effectiveState !== "idle" || Boolean(devCaptureIdle) || updateMode;

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
          updateMode ? "rf-island-shell--update" : ""
        } ${
          effectiveState === "expanded" ? "overflow-visible shadow-2xl" : "overflow-hidden"
        } ${interactive ? "cursor-pointer" : "cursor-default"}`}
        style={{ borderRadius: dims.borderRadius }}
      >
        <AnimatePresence initial={false}>
          {updateMode && updateAvailable ? (
            updateAvailable.collapsed ? (
              <ContentShell key="update-compact">
                <IslandUpdateCompactContent version={updateAvailable.selectedVersion} />
              </ContentShell>
            ) : (
              <ContentShell key="update-expanded" enterScale={0.95}>
                <IslandUpdateExpandedContent
                  notes={updateAvailable.notes}
                  installableVersion={updateAvailable.installableVersion}
                  versionOptions={updateAvailable.versionOptions}
                  selectedVersion={updateAvailable.selectedVersion}
                  onSelectVersion={updateAvailable.onSelectVersion}
                  onHideUntilRestart={updateAvailable.onHideUntilRestart}
                  onInstallRestart={updateAvailable.onInstallRestart}
                />
              </ContentShell>
            )
          ) : null}
          {!updateMode && state === "idle" && devCaptureIdle ? (
            <IslandIdleDevCaptureContent
              key="idle"
              hover={devCaptureIdle.hover}
              busy={devCaptureIdle.busy}
              onCapture={devCaptureIdle.onCapture}
            />
          ) : null}
          {!updateMode && state === "idle" && !devCaptureIdle ? <IdleContent key="idle" /> : null}
          {!updateMode && state === "compact" && (
            <CompactContent key="compact" content={content} waveformLevels={waveformLevels} />
          )}
          {!updateMode && state === "capture" && captureSavedCaption && captureSavedPreviewSrc && onCaptureSavedOpen ? (
            <IslandCaptureSavedContent
              key="capture"
              caption={captureSavedCaption}
              previewSrc={captureSavedPreviewSrc}
              onOpen={onCaptureSavedOpen}
            />
          ) : null}
          {!updateMode && state === "expanded" && (
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

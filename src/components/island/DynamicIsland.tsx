import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

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
  ISLAND_UPDATE_EXPANDED_DIMENSIONS,
  islandUpdateCollapsedWidth,
  type IslandUpdateContentProps,
} from "./IslandUpdateContent";
import {
  ISLAND_SKIP_TRANSITION,
  islandSkipCompactVariants,
  type IslandSkipDir,
} from "./islandSkipMotion";
import { consumeIslandSkipDir, noteIslandSkipDir } from "@/lib/islandSkipDirection";

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

import type { LoopMode } from "@/playbackLoopStorage";

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
  loopMode: LoopMode;
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
  /** Cross-window hint (desktop overlay). Wins over local pending when trackKey changes. */
  skipDirHint?: IslandSkipDir | null;
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

function CompactCoverArt({
  src,
  trackKey,
  skipDir,
}: {
  src: string | null;
  trackKey: string;
  skipDir: IslandSkipDir;
}) {
  return (
    <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
      <AnimatePresence initial={false} custom={skipDir} mode="popLayout">
        <motion.div
          key={trackKey || "empty"}
          custom={skipDir}
          variants={islandSkipCompactVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={ISLAND_SKIP_TRANSITION}
          className="absolute inset-0 overflow-hidden rounded-full"
        >
          {src ? (
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-white/10" />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CompactContent({
  content,
  waveformLevels,
  skipDir,
}: {
  content: DynamicIslandContent;
  waveformLevels: readonly number[];
  skipDir: IslandSkipDir;
}) {
  return (
    <ContentShell>
      <div className="pointer-events-none flex h-full items-center justify-between px-2">
        <CompactCoverArt
          src={content.coverSrc}
          trackKey={content.trackKey}
          skipDir={skipDir}
        />
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
  skipDirHint = null,
}: DynamicIslandProps) {
  const pendingSkipDirRef = useRef<IslandSkipDir>(1);
  const skipDirRef = useRef<IslandSkipDir>(1);
  const prevTrackKeyRef = useRef(content.trackKey);

  // Consume direction during render so AnimatePresence gets the right custom
  // on the same frame the trackKey changes (useEffect is one frame too late).
  if (content.trackKey !== prevTrackKeyRef.current) {
    const buttonDir = pendingSkipDirRef.current;
    pendingSkipDirRef.current = 1;
    if (skipDirHint === 1 || skipDirHint === -1) {
      skipDirRef.current = skipDirHint;
      consumeIslandSkipDir();
    } else if (buttonDir === -1) {
      skipDirRef.current = -1;
      consumeIslandSkipDir();
    } else {
      skipDirRef.current = consumeIslandSkipDir();
    }
    prevTrackKeyRef.current = content.trackKey;
  }
  const skipDir = skipDirRef.current;

  const handleSkipPrev = useCallback(
    (e: MouseEvent) => {
      pendingSkipDirRef.current = -1;
      noteIslandSkipDir(-1);
      onSkipPrev?.(e);
    },
    [onSkipPrev],
  );

  const handleSkipNext = useCallback(
    (e: MouseEvent) => {
      pendingSkipDirRef.current = 1;
      noteIslandSkipDir(1);
      onSkipNext?.(e);
    },
    [onSkipNext],
  );

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
          width: islandUpdateCollapsedWidth(),
          height: 36,
          borderRadius: 18,
        }
      : updateMode && !updateAvailable?.collapsed
        ? { ...ISLAND_UPDATE_EXPANDED_DIMENSIONS }
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
          updateMode || effectiveState !== "expanded"
            ? "overflow-hidden"
            : "overflow-visible shadow-2xl"
        } ${updateMode && !updateAvailable?.collapsed ? "shadow-2xl" : ""} ${
          interactive ? "cursor-pointer" : "cursor-default"
        }`}
        style={{ borderRadius: dims.borderRadius }}
      >
        <AnimatePresence initial={false}>
          {updateMode && updateAvailable ? (
            updateAvailable.collapsed ? (
              <ContentShell key="update-compact">
                <IslandUpdateCompactContent />
              </ContentShell>
            ) : (
              <ContentShell key="update-expanded" enterScale={0.95}>
                <IslandUpdateExpandedContent
                  notes={updateAvailable.notes}
                  installableVersion={updateAvailable.installableVersion}
                  selectedVersion={updateAvailable.selectedVersion}
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
            <CompactContent
              key="compact"
              content={content}
              waveformLevels={waveformLevels}
              skipDir={skipDir}
            />
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
              skipDir={skipDir}
              onPlayPause={onPlayPause}
              onSeek={onSeek}
              onBeginScrub={onBeginScrub}
              onReleaseScrub={onReleaseScrub}
              onOpenPlayer={onOpenPlayer}
              onSkipPrev={handleSkipPrev}
              onSkipNext={handleSkipNext}
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

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
import { IslandNoticeContent, noticeIslandWidth, type IslandNotice } from "./IslandNoticeContent";
import {
  DOWNLOAD_ISLAND_WIDTH,
  downloadIslandWidth,
  ISLAND_SWAP_CONTENT,
  ISLAND_SWAP_SQUEEZE_MS,
  IslandDownloadContent,
  IslandProgressRing,
  type IslandDownload,
} from "./IslandDownloadContent";
import { IslandDownloadExpandedContent, islandDownloadExpandedDims } from "./IslandDownloadExpandedContent";
import { IslandExpandedContent } from "./IslandExpandedContent";
import { IslandNotificationsContent, islandNotificationsDims } from "./IslandNotificationsContent";
import type { NotificationCenterPanelProps } from "@/components/notifications/NotificationCenterPanel";
import {
  IslandUpdateCompactContent,
  IslandUpdateExpandedContent,
  ISLAND_UPDATE_EXPANDED_DIMENSIONS,
  islandUpdateCollapsedWidth,
  type IslandUpdateContentProps,
} from "./IslandUpdateContent";
import {
  IslandWatchlistCompactContent,
  IslandWatchlistExpandedContent,
  ISLAND_WATCHLIST_EXPANDED_DIMENSIONS,
  islandWatchlistCollapsedWidth,
  type IslandWatchlist,
} from "./IslandWatchlistContent";
import {
  ISLAND_SKIP_TRANSITION,
  islandSkipCompactVariants,
  type IslandSkipDir,
} from "./islandSkipMotion";
import { consumeIslandSkipDir, noteIslandSkipDir } from "@/lib/islandSkipDirection";

export type IslandState =
  | "idle"
  | "compact"
  | "expanded"
  | "capture"
  | "notice"
  | "download"
  | "download-expanded"
  | "watchlist"
  | "watchlist-expanded"
  | "notifications";

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
  notice: { width: 220, height: 36, borderRadius: 18 },
  download: { width: DOWNLOAD_ISLAND_WIDTH, height: 36, borderRadius: 18 },
  "download-expanded": islandDownloadExpandedDims(1),
  expanded: { width: 350, height: 184, borderRadius: 40 },
  watchlist: { width: 240, height: 36, borderRadius: 18 },
  "watchlist-expanded": { ...ISLAND_WATCHLIST_EXPANDED_DIMENSIONS },
  notifications: { width: 400, height: 220, borderRadius: 24 },
};

import type { AudioOutputDevice } from "@/audioOutputDevices";
import type { LoopMode } from "@/playbackLoopStorage";

function isPillSwap(from: IslandState, to: IslandState): boolean {
  return (from === "compact" && to === "download") || (from === "download" && to === "compact");
}

const COLLAPSED_PILL_H = 36;
/** Desktop overlay pills: the in-app island stays at 36 to match the onboarding island in the same slot. */
const COMPACT_PILL_H = 32;
const COMPACT_PILL_TRIM_W = 12;

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
  audioOutputDeviceId: string;
  /** Main-enumerated outputs for overlay webviews that cannot list devices. */
  audioOutputDevices: AudioOutputDevice[];
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
  onAudioOutput?: (deviceId: string) => void;
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
  /** Shown when `state` is "notice"; takes over a collapsed update pill too. */
  notice?: IslandNotice | null;
  /** Active download: its own pill in "download", a ring around the music pill in "compact". */
  download?: IslandDownload | null;
  onOpenDownloads?: () => void;
  /** Starts a paused or held lead download from the pill. */
  onStartDownload?: (jobId: string) => void;
  /** Cross-window hint (desktop overlay). Wins over local pending when trackKey changes. */
  skipDirHint?: IslandSkipDir | null;
  /** Desktop overlay only: new uploads from followed channels for "watchlist" states. */
  watchlist?: IslandWatchlist | null;
  onWatchlistQueue?: (videoId: string) => void;
  onWatchlistOpen?: (videoId: string) => void;
  onWatchlistMarkAllSeen?: () => void;
  onWatchlistShowMore?: () => void;
  /** Main island only: the notification center when `state` is "notifications". */
  notifications?: NotificationCenterPanelProps | null;
  /** The empty idle pill reacts to taps (it opens notifications). */
  idleTappable?: boolean;
  /** Desktop overlay: slimmer collapsed pills. */
  compactPills?: boolean;
};

function ContentShell({
  children,
  enterScale = 0.8,
  swap = false,
}: {
  children: ReactNode;
  enterScale?: number;
  /** Rides the shell squeeze when music and download trade places. */
  swap?: boolean;
}) {
  if (swap) {
    return (
      <motion.div {...ISLAND_SWAP_CONTENT} className="absolute inset-0">
        {children}
      </motion.div>
    );
  }
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

/**
 * Pins a content layer to its own state's size, anchored top-center, so it never reflows while the
 * shell springs between sizes; the shell clips it instead. An exiting layer keeps the size it had,
 * since AnimatePresence renders it with its last props.
 */
function IslandStage({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width, height }}>
      {children}
    </div>
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
    <ContentShell swap>
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
  onAudioOutput,
  onPopOut,
  devCaptureIdle,
  captureSavedCaption,
  captureSavedPreviewSrc,
  onCaptureSavedOpen,
  updateAvailable,
  notice = null,
  download = null,
  onOpenDownloads,
  onStartDownload,
  skipDirHint = null,
  watchlist = null,
  onWatchlistQueue,
  onWatchlistOpen,
  onWatchlistMarkAllSeen,
  onWatchlistShowMore,
  notifications = null,
  idleTappable = false,
  compactPills = false,
}: DynamicIslandProps) {
  const [notificationsHeight, setNotificationsHeight] = useState<number | null>(null);
  const [sizeSettled, setSizeSettled] = useState(true);
  const reduceMotion = useReducedMotion();
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

  const noticeActive = state === "notice" && notice != null;
  const updateMode = Boolean(updateAvailable) && !noticeActive;
  const effectiveState: IslandState = noticeActive
    ? "notice"
    : updateMode
    ? updateAvailable!.collapsed
      ? "idle"
      : "expanded"
    : state;
  const [prevState, setPrevState] = useState(effectiveState);
  const [squeezing, setSqueezing] = useState(false);
  if (prevState !== effectiveState) {
    setPrevState(effectiveState);
    setSqueezing(!reduceMotion && isPillSwap(prevState, effectiveState));
  }
  useEffect(() => {
    if (!squeezing) return;
    const timer = window.setTimeout(() => setSqueezing(false), ISLAND_SWAP_SQUEEZE_MS);
    return () => window.clearTimeout(timer);
  }, [squeezing, effectiveState]);

  const baseDims = ISLAND_DIMENSIONS[effectiveState];
  const restingDims =
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
        : noticeActive
          ? { ...baseDims, width: noticeIslandWidth(notice!.message) }
          : effectiveState === "watchlist" && watchlist
            ? { ...baseDims, width: islandWatchlistCollapsedWidth(watchlist.count) }
            : effectiveState === "download" && download
              ? { ...baseDims, width: downloadIslandWidth(download) }
            : effectiveState === "download-expanded" && download
              ? islandDownloadExpandedDims(download.jobs.length)
              : effectiveState === "notifications"
                ? islandNotificationsDims(notificationsHeight)
                : baseDims;
  const fitPills = (d: { width: number; height: number; borderRadius: number }) =>
    compactPills && d.height === COLLAPSED_PILL_H
      ? { width: d.width - COMPACT_PILL_TRIM_W, height: COMPACT_PILL_H, borderRadius: COMPACT_PILL_H / 2 }
      : d;
  const stageDims = fitPills(restingDims);
  const dims = squeezing ? fitPills({ ...restingDims, width: ISLAND_DIMENSIONS.idle.width }) : stageDims;
  const interactive = effectiveState !== "idle" || Boolean(devCaptureIdle) || updateMode || idleTappable;
  const watchlistFloating = !updateMode && effectiveState === "watchlist-expanded";
  const downloadFloating = !updateMode && effectiveState === "download-expanded" && download != null;
  const notificationsFloating = !updateMode && effectiveState === "notifications" && notifications != null;
  // Expanded needs overflow for its menus, but only once grown; mid-spring it would spill full-size controls.
  const overflowVisible = !updateMode && effectiveState === "expanded" && sizeSettled;

  const stage = (key: string, node: ReactNode) => (
    <IslandStage key={key} width={stageDims.width} height={stageDims.height}>
      {node}
    </IslandStage>
  );

  return (
    <motion.div
      initial={false}
      animate={dims}
      transition={ISLAND_SPRING}
      style={{ originY: 0, WebkitAppRegion: "no-drag" } as CSSProperties}
      className="pointer-events-auto relative"
      onClick={onClick}
      onAnimationStart={() => setSizeSettled(false)}
      onAnimationComplete={() => setSizeSettled(true)}
    >
      <div
        className={`rf-island-shell relative h-full w-full ${
          updateMode ? "rf-island-shell--update" : ""
        } ${overflowVisible ? "overflow-visible" : "overflow-hidden"} ${
          !updateMode && effectiveState === "expanded" ? "shadow-2xl" : ""
        } ${(updateMode && !updateAvailable?.collapsed) || watchlistFloating || downloadFloating || notificationsFloating ? "shadow-2xl" : ""} ${
          interactive ? "cursor-pointer" : "cursor-default"
        }`}
        style={{ borderRadius: dims.borderRadius }}
      >
        <AnimatePresence initial={false}>
          {updateMode && updateAvailable
            ? updateAvailable.collapsed
              ? stage(
                  "update-compact",
                  <ContentShell>
                    <IslandUpdateCompactContent />
                  </ContentShell>,
                )
              : stage(
                  "update-expanded",
                  <ContentShell enterScale={0.95}>
                    <IslandUpdateExpandedContent
                      notes={updateAvailable.notes}
                      installableVersion={updateAvailable.installableVersion}
                      selectedVersion={updateAvailable.selectedVersion}
                      onHideUntilRestart={updateAvailable.onHideUntilRestart}
                      onInstallRestart={updateAvailable.onInstallRestart}
                    />
                  </ContentShell>,
                )
            : null}
          {!updateMode && state === "idle" && devCaptureIdle
            ? stage(
                "idle",
                <IslandIdleDevCaptureContent
                  hover={devCaptureIdle.hover}
                  busy={devCaptureIdle.busy}
                  onCapture={devCaptureIdle.onCapture}
                />,
              )
            : null}
          {!updateMode && state === "idle" && !devCaptureIdle ? stage("idle", <IdleContent />) : null}
          {!updateMode && state === "compact"
            ? stage(
                "compact",
                <CompactContent content={content} waveformLevels={waveformLevels} skipDir={skipDir} />,
              )
            : null}
          {!updateMode && state === "capture" && captureSavedCaption && captureSavedPreviewSrc && onCaptureSavedOpen
            ? stage(
                "capture",
                <IslandCaptureSavedContent
                  caption={captureSavedCaption}
                  previewSrc={captureSavedPreviewSrc}
                  onOpen={onCaptureSavedOpen}
                />,
              )
            : null}
          {noticeActive
            ? stage(
                `notice-${notice!.id}`,
                <IslandNoticeContent notice={notice!} accentColor={content.accentColor} />,
              )
            : null}
          {!updateMode && state === "download" && download
            ? stage("download", <IslandDownloadContent download={download} onStart={onStartDownload} />)
            : null}
          {downloadFloating
            ? stage(
                "download-expanded",
                <IslandDownloadExpandedContent
                  download={download!}
                  accentColor={content.accentColor}
                  onOpenDownloads={() => onOpenDownloads?.()}
                />,
              )
            : null}
          {notificationsFloating
            ? stage(
                "notifications",
                <IslandNotificationsContent panel={notifications!} onHeight={setNotificationsHeight} />,
              )
            : null}
          {!updateMode && state === "watchlist" && watchlist
            ? stage("watchlist-compact", <IslandWatchlistCompactContent watchlist={watchlist} />)
            : null}
          {watchlistFloating && watchlist
            ? stage(
                "watchlist-expanded",
                <IslandWatchlistExpandedContent
                  watchlist={watchlist}
                  accentColor={content.accentColor}
                  onQueue={(id) => onWatchlistQueue?.(id)}
                  onOpen={(id) => onWatchlistOpen?.(id)}
                  onMarkAllSeen={() => onWatchlistMarkAllSeen?.()}
                  onShowMore={() => onWatchlistShowMore?.()}
                />,
              )
            : null}
          {!updateMode && state === "expanded"
            ? stage(
                "expanded",
                <IslandExpandedContent
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
                  onAudioOutput={onAudioOutput}
                  onPopOut={onPopOut}
                />,
              )
            : null}
        </AnimatePresence>
        {download && !updateMode && (effectiveState === "download" || effectiveState === "compact") ? (
          <IslandProgressRing
            pct={download.waiting ? (download.pct ?? 0) : download.pct}
            pulse={!download.waiting && download.pct != null}
            radius={dims.borderRadius}
            color={content.accentColor}
          />
        ) : null}
      </div>
    </motion.div>
  );
}

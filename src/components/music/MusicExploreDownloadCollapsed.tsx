import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, ChevronUp, Music2, TriangleAlert, X } from "lucide-react";
import type { DownloadJob } from "@/downloadQueue";
import { jobHasDownloadTransferStarted } from "@/downloadQueue";
import {
  isActiveMusicExploreDownloadUi,
  musicExploreTrackDownloadUi,
} from "@/lib/musicExploreDownloadStatus";
import { isLikelyImageUrl, type MusicTrackInfo } from "@/lib/musicExploreTracks";
import { extractYouTubeVideoId, youtubeUrlsMatch } from "@/youtubeUrl";
import { cn } from "@/lib/utils";

export type CollapsedCelebrate = {
  url: string;
  title: string;
  thumbnail: string | null;
  warning?: boolean;
  startPct?: number;
};

function resolveTrackThumb(thumbnail: string | null | undefined, url: string): string | null {
  const trimmed = thumbnail?.trim();
  if (trimmed && isLikelyImageUrl(trimmed)) return trimmed;
  const videoId = extractYouTubeVideoId(url);
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return null;
}

const STROKE = 2;
const ORB_RING_OUTSET = 4;
const ORB_SIZE = 32;
const ORB_GAP = 8;
const CHIP_SIZE = 36;
const CHIP_THUMB = 28;
const SIDEBAR_MS = 200;
const ORB_COMPLETE_FILL_MS = 520;
const CHIP_EXIT_MS = 320;

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function useOrbCompleteSequence(active: boolean, startPct: number) {
  const [ringPct, setRingPct] = useState(() => clampPct(startPct));
  const [completeVisual, setCompleteVisual] = useState(false);
  const [iconOpacity, setIconOpacity] = useState(0);
  const [iconScale, setIconScale] = useState(0.55);

  useLayoutEffect(() => {
    if (!active) {
      setCompleteVisual(false);
      setIconOpacity(0);
      setIconScale(0.55);
      return;
    }

    const start = clampPct(startPct);
    setRingPct(start);
    setCompleteVisual(false);
    setIconOpacity(0);
    setIconScale(0.55);

    let kick2 = 0;
    const kick1 = requestAnimationFrame(() => {
      kick2 = requestAnimationFrame(() => {
        setCompleteVisual(true);
        setRingPct(100);
        setIconOpacity(1);
        setIconScale(1);
      });
    });

    return () => {
      cancelAnimationFrame(kick1);
      cancelAnimationFrame(kick2);
    };
  }, [active, startPct]);

  return { ringPct, completeVisual, iconOpacity, iconScale };
}

function OrbRing({
  pct,
  indeterminate,
  success,
  warning,
  orbSize,
  progressClassName = "rf-dock-chip-progress-stroke",
}: {
  pct: number;
  indeterminate?: boolean;
  success?: boolean;
  warning?: boolean;
  orbSize: number;
  progressClassName?: string;
}) {
  const ringSz = orbSize + 8;
  const r = (ringSz - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  const stroke = warning ? "#eab308" : success ? "#22c55e" : "var(--music-accent)";
  const track = warning
    ? "rgb(234 179 8 / 0.2)"
    : success
      ? "rgb(34 197 94 / 0.2)"
      : "rgb(255 255 255 / 0.12)";

  const svg = (
    <svg
      width={ringSz}
      height={ringSz}
      viewBox={`0 0 ${ringSz} ${ringSz}`}
      aria-hidden
    >
      <circle cx={ringSz / 2} cy={ringSz / 2} r={r} fill="none" stroke={track} strokeWidth={STROKE} />
      <circle
        cx={ringSz / 2}
        cy={ringSz / 2}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={indeterminate ? `${circ * 0.28} ${circ * 0.72}` : circ}
        strokeDashoffset={indeterminate ? 0 : offset}
        transform={`rotate(-90 ${ringSz / 2} ${ringSz / 2})`}
        className={progressClassName}
      />
    </svg>
  );

  return (
    <div
      className={cn("pointer-events-none", indeterminate && "animate-spin")}
      style={{ position: "absolute", top: -4, left: -4, width: ringSz, height: ringSz }}
    >
      {svg}
    </div>
  );
}

function jobForTrack(jobs: DownloadJob[], trackUrl: string): DownloadJob | undefined {
  const matches = jobs.filter((j) => youtubeUrlsMatch(j.url, trackUrl));
  return (
    matches.find((j) => j.status === "downloading") ??
    matches.find((j) => j.status === "queued" || j.status === "paused") ??
    matches[0]
  );
}

function TrackThumb({
  thumbnail,
  title,
  size,
}: {
  thumbnail: string | null;
  title: string;
  size: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
        >
          <Music2 size={Math.round(size * 0.4)} />
        </div>
      )}
    </div>
  );
}

function PillProgressBorder({
  pct,
  indeterminate,
  success,
  warning,
  progressClassName = "rf-dock-chip-progress-stroke",
}: {
  pct: number;
  indeterminate?: boolean;
  success?: boolean;
  warning?: boolean;
  progressClassName?: string;
}) {
  const stroke = warning ? "#eab308" : success ? "#22c55e" : "var(--music-accent)";
  const track = warning
    ? "rgb(234 179 8 / 0.2)"
    : success
      ? "rgb(34 197 94 / 0.2)"
      : "rgb(255 255 255 / 0.12)";
  const clamped = Math.min(100, Math.max(0, pct));
  const dash = indeterminate ? "28 72" : `${clamped} ${100 - clamped}`;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x={STROKE / 2}
        y={STROKE / 2}
        width={`calc(100% - ${STROKE}px)`}
        height={`calc(100% - ${STROKE}px)`}
        rx={CHIP_SIZE / 2}
        ry={CHIP_SIZE / 2}
        fill="none"
        stroke={track}
        strokeWidth={STROKE}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={STROKE / 2}
        y={STROKE / 2}
        width={`calc(100% - ${STROKE}px)`}
        height={`calc(100% - ${STROKE}px)`}
        rx={CHIP_SIZE / 2}
        ry={CHIP_SIZE / 2}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
        className={cn(
          progressClassName,
          indeterminate && "rf-dock-pill-indeterminate-stroke",
        )}
      />
    </svg>
  );
}

function TrackOrb({
  thumbnail,
  title,
  pct,
  indeterminate,
  completing,
  completeStartPct,
  warning,
  size,
}: {
  thumbnail: string | null;
  title: string;
  pct: number;
  indeterminate?: boolean;
  completing?: boolean;
  completeStartPct?: number;
  warning?: boolean;
  size: number;
}) {
  const seq = useOrbCompleteSequence(!!completing, completeStartPct ?? pct);
  const displayPct = completing ? seq.ringPct : pct;
  const ringSuccess = !!completing && !warning;
  const ringWarning = !!completing && !!warning;
  const showIcon = !!completing;
  const frame = size + ORB_RING_OUTSET * 2;
  const iconSize = Math.round(size * 0.38);

  return (
    <div
      className="relative shrink-0 overflow-visible flex items-center justify-center"
      style={{ width: frame, height: frame }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <TrackThumb thumbnail={thumbnail} title={title} size={size} />

        <OrbRing
          pct={displayPct}
          indeterminate={indeterminate && !completing}
          success={ringSuccess}
          warning={ringWarning}
          orbSize={size}
          progressClassName={completing ? "rf-orb-complete-stroke" : "rf-dock-chip-progress-stroke"}
        />

        {showIcon && (
          <div
            className="absolute inset-0 z-[1] flex items-center justify-center rounded-full pointer-events-none"
            style={{
              background: "rgb(0 0 0 / 0.5)",
              opacity: seq.iconOpacity,
              transform: `scale(${seq.iconScale})`,
              transition: `
                transform ${ORB_COMPLETE_FILL_MS}ms cubic-bezier(0.16, 1, 0.3, 1),
                opacity ${ORB_COMPLETE_FILL_MS}ms ease-out
              `,
            }}
          >
            {warning ? (
              <TriangleAlert size={iconSize} strokeWidth={2.5} style={{ color: "#eab308" }} />
            ) : (
              <Check size={iconSize} strokeWidth={2.5} style={{ color: "#22c55e" }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function itemOrderIndex(items: MusicTrackInfo[], url: string): number {
  const idx = items.findIndex((t) => youtubeUrlsMatch(t.url, url));
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function synthesizeFromJobs(jobs: DownloadJob[]): MusicTrackInfo[] {
  return jobs
    .filter((j) => j.status === "queued" || j.status === "downloading" || j.status === "paused")
    .map((j) => ({
      id: j.url,
      url: j.url,
      title: j.metadata?.title ?? j.title ?? j.url,
      thumbnail: j.metadata?.thumbnail?.trim() || null,
      duration: null,
      artist: null,
      album: null,
    }));
}

function visibleCollapsedTracks(
  items: MusicTrackInfo[],
  downloadJobs: DownloadJob[],
  celebrating: CollapsedCelebrate | null,
): MusicTrackInfo[] {
  if (celebrating) {
    const hit = items.find((t) => youtubeUrlsMatch(t.url, celebrating.url));
    if (hit) return [hit];
    return [
      {
        id: celebrating.url,
        title: celebrating.title,
        url: celebrating.url,
        duration: null,
        thumbnail: celebrating.thumbnail,
        artist: null,
        album: null,
      },
    ];
  }
  const fromItems = items.filter((t) =>
    isActiveMusicExploreDownloadUi(musicExploreTrackDownloadUi(downloadJobs, t.url)),
  );
  // When the panel has no loaded items (bottom-bar enqueue without panel open),
  // synthesize orb stubs directly from active jobs so the sidebar isn't blank.
  if (fromItems.length === 0 && items.length === 0) {
    return synthesizeFromJobs(downloadJobs);
  }
  return fromItems;
}

function pickFocalTrack(
  visible: MusicTrackInfo[],
  items: MusicTrackInfo[],
  downloadJobs: DownloadJob[],
  celebrating: CollapsedCelebrate | null,
): MusicTrackInfo | null {
  if (visible.length === 0) return null;
  if (celebrating) {
    const hit = visible.find((t) => youtubeUrlsMatch(t.url, celebrating.url));
    if (hit) return hit;
  }
  const downloading = visible.find(
    (t) => musicExploreTrackDownloadUi(downloadJobs, t.url) === "downloading",
  );
  if (downloading) return downloading;
  const queued = [...visible]
    .filter((t) => musicExploreTrackDownloadUi(downloadJobs, t.url) === "queued")
    .sort((a, b) => itemOrderIndex(items, a.url) - itemOrderIndex(items, b.url));
  return queued[0] ?? visible[0];
}

/** Screen-top to screen-bottom; focal (active) is last so it sits on the bottom edge. */
function stackTopToBottom(
  visible: MusicTrackInfo[],
  items: MusicTrackInfo[],
  focal: MusicTrackInfo,
): MusicTrackInfo[] {
  const rest = visible
    .filter((t) => !youtubeUrlsMatch(t.url, focal.url))
    .sort((a, b) => itemOrderIndex(items, a.url) - itemOrderIndex(items, b.url));
  return [...rest, focal];
}

function stackOrbOpacity(index: number, total: number, isFocal: boolean): number {
  if (isFocal) return 1;
  const stepsFromFocal = total - 1 - index;
  return Math.max(0.22, 0.88 - stepsFromFocal * 0.22);
}

type CollapsedProps = {
  items: MusicTrackInfo[];
  downloadJobs: DownloadJob[];
  celebrating: CollapsedCelebrate | null;
  loading?: boolean;
  /** Multi-track playlist batch: one bubble until expanded. */
  playlistBatch?: boolean;
  onMinimize?: () => void;
  onCancelAll?: () => void;
};

export function MusicExploreDownloadCollapsed({
  items,
  downloadJobs,
  celebrating,
  loading = false,
  playlistBatch = false,
  onMinimize,
  onCancelAll,
}: CollapsedProps) {
  const [stackExpanded, setStackExpanded] = useState(false);

  const visibleItems = useMemo(
    () => visibleCollapsedTracks(items, downloadJobs, celebrating),
    [items, downloadJobs, celebrating],
  );

  const focalTrack = useMemo(
    () => pickFocalTrack(visibleItems, items, downloadJobs, celebrating),
    [visibleItems, items, downloadJobs, celebrating],
  );

  const showStack = !playlistBatch || stackExpanded;
  const stackTracks = useMemo(() => {
    if (!focalTrack) return [];
    if (!showStack) return [focalTrack];
    return stackTopToBottom(visibleItems, items, focalTrack);
  }, [focalTrack, showStack, visibleItems, items]);

  const collapseStack = useCallback(() => setStackExpanded(false), []);

  const togglePlaylistStack = useCallback(() => {
    if (!playlistBatch) return;
    setStackExpanded((v) => !v);
  }, [playlistBatch]);

  const showLoadingOrb = loading && visibleItems.length === 0;

  useEffect(() => {
    if (visibleItems.length <= 1) setStackExpanded(false);
  }, [visibleItems.length]);

  return (
    <div className="flex flex-1 flex-col min-h-0 items-center">
      <div
        className="flex flex-col items-center w-full min-h-0 flex-1 overflow-y-auto rf-scrollbar justify-end p-1.5"
        style={{ gap: ORB_GAP }}
      >
        {onCancelAll && visibleItems.length > 0 && (
          <button
            type="button"
            onClick={onCancelAll}
            className="rf-music-tooltip-anchor flex items-center justify-center w-6 h-4 opacity-30 hover:opacity-80 transition-opacity shrink-0"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Cancel all downloads"
            data-tooltip="Cancel all"
          >
            <X size={11} />
          </button>
        )}

        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            className="rf-music-tooltip-anchor flex items-center justify-center w-6 h-4 opacity-30 hover:opacity-80 transition-opacity shrink-0"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Minimize downloads to dock"
            data-tooltip="Minimize"
          >
            <ChevronDown size={11} />
          </button>
        )}

        {playlistBatch && stackExpanded && stackTracks.length > 1 && (
          <button
            type="button"
            onClick={collapseStack}
            className="rf-music-tooltip-anchor flex items-center justify-center w-6 h-4 opacity-30 hover:opacity-80 transition-opacity shrink-0"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Collapse download stack"
            data-tooltip="Collapse"
          >
            <ChevronUp size={11} />
          </button>
        )}

        <AnimatePresence initial={false}>
          {showLoadingOrb ? (
            <motion.div
              key="loading-orb"
              initial={{ opacity: 0, y: 14, scale: 0.82 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.82 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative shrink-0 overflow-visible flex items-center justify-center"
              style={{ width: ORB_SIZE + ORB_RING_OUTSET * 2, height: ORB_SIZE + ORB_RING_OUTSET * 2 }}
            >
              <div className="relative" style={{ width: ORB_SIZE, height: ORB_SIZE }}>
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--music-surface-raised)" }}
                />
                <OrbRing pct={0} indeterminate orbSize={ORB_SIZE} />
              </div>
            </motion.div>
          ) : (
            stackTracks.map((track, index) => {
              const isCelebrating =
                !!celebrating && youtubeUrlsMatch(track.url, celebrating.url);
              const isWarningCelebrate = isCelebrating && !!celebrating?.warning;
              const isFocal =
                !!focalTrack && youtubeUrlsMatch(track.url, focalTrack.url);
              const job = jobForTrack(downloadJobs, track.url);
              const rawLivePct = clampPct(job?.progress?.percentage ?? 0);
              const livePct =
                !isCelebrating && job?.status === "downloading"
                  ? Math.min(rawLivePct, 99)
                  : rawLivePct;
              const indeterminate =
                !isCelebrating &&
                livePct < 100 &&
                !!job &&
                (job.status === "queued" ||
                  job.status === "paused" ||
                  (job.status === "downloading" &&
                    !jobHasDownloadTransferStarted(job)));
              const opacity = stackOrbOpacity(index, stackTracks.length, isFocal);
              const canToggleStack =
                playlistBatch && isFocal && visibleItems.length > 1;
              const completeStartPct = isCelebrating
                ? Math.min(clampPct(celebrating?.startPct ?? livePct), 99)
                : livePct;
              const thumbSrc = resolveTrackThumb(
                isCelebrating
                  ? celebrating?.thumbnail ?? track.thumbnail
                  : track.thumbnail,
                track.url,
              );

              return (
                <motion.div
                  key={track.url}
                  initial={{ opacity: 0, y: 18, scale: 0.78 }}
                  animate={{ opacity, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 18, scale: 0.78 }}
                  transition={{
                    duration: 0.22,
                    ease: "easeOut",
                    delay: showStack && stackTracks.length > 1 ? index * 0.04 : 0,
                  }}
                  className={cn(canToggleStack && "cursor-pointer")}
                  onClick={canToggleStack ? togglePlaylistStack : undefined}
                  role={canToggleStack ? "button" : undefined}
                  tabIndex={canToggleStack ? 0 : undefined}
                  onKeyDown={
                    canToggleStack
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            togglePlaylistStack();
                          }
                        }
                      : undefined
                  }
                  aria-label={
                    canToggleStack
                      ? stackExpanded
                        ? "Collapse playlist downloads"
                        : "Expand playlist downloads"
                      : undefined
                  }
                >
                  <TrackOrb
                    thumbnail={thumbSrc}
                    title={isCelebrating ? celebrating?.title ?? track.title : track.title}
                    pct={livePct}
                    indeterminate={indeterminate}
                    completing={isCelebrating}
                    completeStartPct={completeStartPct}
                    warning={isWarningCelebrate}
                    size={ORB_SIZE}
                  />
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

type DockChipProps = {
  downloadJobs: DownloadJob[];
  celebrating?: CollapsedCelebrate | null;
  navCollapsed?: boolean;
  onClick: () => void;
};

/** Minimized download indicator shown in nav footer above Back button. */
export function ExploreDownloadDockChip({
  downloadJobs,
  celebrating = null,
  navCollapsed = false,
  onClick,
}: DockChipProps) {
  const activeJobs = downloadJobs.filter(
    (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
  );
  const count = activeJobs.length;
  const activeJob =
    activeJobs.find((j) => j.status === "downloading") ??
    activeJobs.find((j) => j.status === "queued") ??
    activeJobs[0];

  const hasWork = count > 0 || !!celebrating;
  const [present, setPresent] = useState(hasWork);
  const [fadingOut, setFadingOut] = useState(false);
  const [livePct, setLivePct] = useState(0);
  const lastPctRef = useRef(0);

  const title =
    celebrating?.title ?? activeJob?.metadata?.title ?? "Downloading";
  const thumbnail = resolveTrackThumb(
    celebrating?.thumbnail ?? activeJob?.metadata?.thumbnail ?? null,
    celebrating?.url ?? activeJob?.url ?? "",
  );
  const warningVisual = !!celebrating?.warning;
  const completeStartPct = celebrating
    ? Math.min(clampPct(celebrating.startPct ?? lastPctRef.current), 99)
    : livePct;
  const completeSeq = useOrbCompleteSequence(!!celebrating, completeStartPct);
  const displayPct = celebrating ? completeSeq.ringPct : livePct;
  const ringSuccess = !!celebrating && !warningVisual;
  const ringWarning = !!celebrating && warningVisual;
  const showCompleteIcon = !!celebrating;

  useEffect(() => {
    if (hasWork) {
      setPresent(true);
      setFadingOut(false);
      return;
    }
    if (!present) return;
    setFadingOut(true);
    const t = window.setTimeout(() => {
      setPresent(false);
      setFadingOut(false);
      setLivePct(0);
      lastPctRef.current = 0;
    }, CHIP_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [hasWork, present]);

  useEffect(() => {
    if (celebrating) return;
    if (!activeJob) return;
    const pct =
      activeJob.status === "downloading"
        ? Math.min(clampPct(activeJob.progress?.percentage ?? 0), 99)
        : clampPct(activeJob.progress?.percentage ?? 0);
    lastPctRef.current = pct;
    setLivePct(pct);
  }, [
    celebrating,
    activeJob?.id,
    activeJob?.status,
    activeJob?.progress?.percentage,
  ]);

  const indeterminate =
    !celebrating &&
    !!activeJob &&
    livePct < 100 &&
    (activeJob.status === "queued" ||
      activeJob.status === "paused" ||
      (activeJob.status === "downloading" &&
        !jobHasDownloadTransferStarted(activeJob)));

  if (!present) return null;

  const ariaLabel = showCompleteIcon || celebrating
    ? warningVisual
      ? "Download timed out. Click to expand."
      : "Download complete. Click to expand."
    : `${count} download${count !== 1 ? "s" : ""} in progress. Click to expand.`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rf-dock-chip rf-music-tooltip-anchor relative flex items-center rounded-full",
        navCollapsed ? "overflow-visible justify-center gap-0 px-0 w-11" : "overflow-hidden w-full gap-2 pl-1 pr-2.5",
        "transition-[width,padding,gap,opacity,transform] ease-out hover:opacity-90",
        fadingOut ? "opacity-0 scale-[0.96]" : "opacity-100 scale-100",
      )}
      style={{
        height: navCollapsed ? CHIP_SIZE + ORB_RING_OUTSET * 2 : CHIP_SIZE,
        minWidth: navCollapsed ? CHIP_SIZE + ORB_RING_OUTSET * 2 : CHIP_SIZE,
        transitionDuration: `${SIDEBAR_MS}ms`,
        background: "var(--music-surface-raised)",
        color: "var(--music-text-primary)",
      }}
      aria-label={ariaLabel}
      data-tooltip={navCollapsed ? "Expand downloads" : undefined}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity ease-out",
          navCollapsed ? "opacity-0" : "opacity-100",
        )}
        style={{ transitionDuration: `${SIDEBAR_MS}ms` }}
        aria-hidden={navCollapsed}
      >
        <PillProgressBorder
          pct={displayPct}
          indeterminate={indeterminate}
          success={ringSuccess}
          warning={ringWarning}
          progressClassName={celebrating ? "rf-orb-complete-stroke" : "rf-dock-chip-progress-stroke"}
        />
      </div>

      <div
        className={cn(
          "relative shrink-0 flex items-center justify-center overflow-visible transition-[width,height] ease-out",
        )}
        style={{
          width: navCollapsed ? CHIP_SIZE + ORB_RING_OUTSET * 2 : CHIP_THUMB,
          height: navCollapsed ? CHIP_SIZE + ORB_RING_OUTSET * 2 : CHIP_THUMB,
          transitionDuration: `${SIDEBAR_MS}ms`,
        }}
      >
        <div
          className="relative"
          style={{
            width: navCollapsed ? CHIP_SIZE : CHIP_THUMB,
            height: navCollapsed ? CHIP_SIZE : CHIP_THUMB,
          }}
        >
          <TrackThumb
            thumbnail={thumbnail}
            title={title}
            size={navCollapsed ? CHIP_SIZE : CHIP_THUMB}
          />

          <div
            className={cn(
              "pointer-events-none absolute inset-0 transition-opacity ease-out",
              navCollapsed ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDuration: `${SIDEBAR_MS}ms` }}
            aria-hidden={!navCollapsed}
          >
            <OrbRing
              pct={displayPct}
              indeterminate={indeterminate}
              success={ringSuccess}
              warning={ringWarning}
              orbSize={CHIP_SIZE}
              progressClassName={celebrating ? "rf-orb-complete-stroke" : "rf-dock-chip-progress-stroke"}
            />
          </div>

          {showCompleteIcon && (
            <div
              className="absolute inset-0 z-[1] flex items-center justify-center rounded-full pointer-events-none"
              style={{
                background: "rgb(0 0 0 / 0.5)",
                opacity: completeSeq.iconOpacity,
                transform: `scale(${completeSeq.iconScale})`,
                transition: `
                  transform ${ORB_COMPLETE_FILL_MS}ms cubic-bezier(0.16, 1, 0.3, 1),
                  opacity ${ORB_COMPLETE_FILL_MS}ms ease-out
                `,
              }}
            >
              {warningVisual ? (
                <TriangleAlert
                  size={navCollapsed ? 14 : 12}
                  strokeWidth={2.5}
                  style={{ color: "#eab308" }}
                />
              ) : (
                <Check
                  size={navCollapsed ? 14 : 12}
                  strokeWidth={2.5}
                  style={{ color: "#22c55e" }}
                />
              )}
            </div>
          )}

          {navCollapsed && !showCompleteIcon && count > 1 && (
            <span
              className="absolute inset-0 z-[1] flex items-center justify-center rounded-full pointer-events-none"
              style={{ background: "rgb(0 0 0 / 0.42)" }}
            >
              <span
                className="text-[10px] font-bold tabular-nums leading-none select-none"
                style={{ color: "#fff", textShadow: "0 1px 3px rgb(0 0 0 / 0.9)" }}
              >
                {count > 99 ? "99+" : count}
              </span>
            </span>
          )}
        </div>
      </div>

      <span
        className={cn(
          "relative z-[1] truncate text-left text-[11px] font-medium leading-none whitespace-nowrap overflow-hidden",
          "transition-[max-width,opacity,flex] ease-out",
          navCollapsed ? "max-w-0 opacity-0 flex-[0_0_0px]" : "max-w-full opacity-100 flex-1 min-w-0 pr-0.5",
        )}
        style={{ transitionDuration: `${SIDEBAR_MS}ms` }}
        aria-hidden={navCollapsed}
      >
        {title}
      </span>
    </button>
  );
}

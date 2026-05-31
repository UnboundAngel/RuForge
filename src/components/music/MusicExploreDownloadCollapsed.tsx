import { useMemo, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, ChevronUp, Music2 } from "lucide-react";
import type { DownloadJob } from "@/downloadQueue";
import { jobHasDownloadTransferStarted } from "@/downloadQueue";
import {
  isActiveMusicExploreDownloadUi,
  musicExploreTrackDownloadUi,
} from "@/lib/musicExploreDownloadStatus";
import type { MusicTrackInfo } from "@/lib/musicExploreTracks";
import { youtubeUrlsMatch } from "@/youtubeUrl";
import { cn } from "@/lib/utils";

export type CollapsedCelebrate = {
  url: string;
  title: string;
  thumbnail: string | null;
};

const STROKE = 2;
const ORB_SIZE = 32;
const ORB_GAP = 8;

function OrbRing({
  pct,
  indeterminate,
  success,
  orbSize,
}: {
  pct: number;
  indeterminate?: boolean;
  success?: boolean;
  orbSize: number;
}) {
  const ringSz = orbSize + 8;
  const r = (ringSz - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  const stroke = success ? "#22c55e" : "var(--music-accent)";
  const track = success ? "rgb(34 197 94 / 0.2)" : "rgb(255 255 255 / 0.12)";

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
        className="transition-[stroke-dashoffset] duration-300 ease-out"
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

function TrackOrb({
  thumbnail,
  title,
  pct,
  indeterminate,
  success,
  size,
}: {
  thumbnail: string | null;
  title: string;
  pct: number;
  indeterminate?: boolean;
  success?: boolean;
  size: number;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
          >
            <Music2 size={Math.round(size * 0.4)} />
          </div>
        )}
      </div>

      <OrbRing pct={pct} indeterminate={indeterminate} success={success} orbSize={size} />

      {success && (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
          className="absolute inset-0 flex items-center justify-center rounded-full pointer-events-none"
          style={{ background: "rgb(0 0 0 / 0.5)" }}
        >
          <Check
            size={Math.round(size * 0.38)}
            strokeWidth={2.5}
            style={{ color: "#22c55e" }}
          />
        </motion.div>
      )}
    </div>
  );
}

function itemOrderIndex(items: MusicTrackInfo[], url: string): number {
  const idx = items.findIndex((t) => youtubeUrlsMatch(t.url, url));
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function visibleCollapsedTracks(
  items: MusicTrackInfo[],
  downloadJobs: DownloadJob[],
  celebrating: CollapsedCelebrate | null,
): MusicTrackInfo[] {
  return items.filter((t) => {
    if (celebrating && youtubeUrlsMatch(t.url, celebrating.url)) return true;
    return isActiveMusicExploreDownloadUi(
      musicExploreTrackDownloadUi(downloadJobs, t.url),
    );
  });
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
};

export function MusicExploreDownloadCollapsed({
  items,
  downloadJobs,
  celebrating,
  loading = false,
  playlistBatch = false,
  onMinimize,
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
    <div className="flex flex-1 flex-col min-h-0 justify-end items-center overflow-hidden">
      <div
        className="flex flex-col items-center w-full min-h-0 justify-end pb-1 px-1.5"
        style={{ gap: ORB_GAP }}
      >
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            className="flex items-center justify-center w-6 h-4 opacity-30 hover:opacity-80 transition-opacity shrink-0"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Minimize downloads to dock"
            title="Minimize"
          >
            <ChevronDown size={11} />
          </button>
        )}

        {playlistBatch && stackExpanded && stackTracks.length > 1 && (
          <button
            type="button"
            onClick={collapseStack}
            className="flex items-center justify-center w-6 h-4 opacity-30 hover:opacity-80 transition-opacity shrink-0"
            style={{ color: "var(--music-text-secondary)" }}
            aria-label="Collapse download stack"
            title="Collapse"
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
              className="relative shrink-0"
              style={{ width: ORB_SIZE, height: ORB_SIZE }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--music-surface-raised)" }}
              />
              <OrbRing pct={0} indeterminate orbSize={ORB_SIZE} />
            </motion.div>
          ) : (
            stackTracks.map((track, index) => {
              const isCelebrating =
                !!celebrating && youtubeUrlsMatch(track.url, celebrating.url);
              const isFocal =
                !!focalTrack && youtubeUrlsMatch(track.url, focalTrack.url);
              const job = jobForTrack(downloadJobs, track.url);
              const pct = isCelebrating ? 100 : (job?.progress?.percentage ?? 0);
              const indeterminate =
                !isCelebrating &&
                pct < 100 &&
                !!job &&
                (job.status === "queued" ||
                  job.status === "paused" ||
                  (job.status === "downloading" &&
                    !jobHasDownloadTransferStarted(job)));
              const opacity = stackOrbOpacity(index, stackTracks.length, isFocal);
              const canToggleStack =
                playlistBatch && isFocal && visibleItems.length > 1;
              const orbPhase = isCelebrating ? "success" : job?.status ?? "idle";

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
                    key={`${track.url}-${orbPhase}`}
                    thumbnail={track.thumbnail}
                    title={track.title}
                    pct={pct}
                    indeterminate={indeterminate}
                    success={isCelebrating}
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

const CHIP_SIZE = 36;

type DockChipProps = {
  downloadJobs: DownloadJob[];
  celebrating?: CollapsedCelebrate | null;
  onClick: () => void;
};

/** Minimized download indicator shown in nav footer above Back button. */
export function ExploreDownloadDockChip({
  downloadJobs,
  celebrating = null,
  onClick,
}: DockChipProps) {
  const activeJobs = downloadJobs.filter(
    (j) => j.status === "queued" || j.status === "downloading",
  );
  const count = activeJobs.length;

  if (celebrating) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative hover:opacity-90 transition-opacity"
        style={{ width: CHIP_SIZE, height: CHIP_SIZE }}
        aria-label="Download complete. Click to expand."
        title="Expand downloads"
      >
        <TrackOrb
          key={`dock-${celebrating.url}-success`}
          thumbnail={celebrating.thumbnail}
          title={celebrating.title}
          pct={100}
          success
          size={CHIP_SIZE}
        />
      </button>
    );
  }

  if (count === 0) return null;

  const activeJob =
    activeJobs.find((j) => j.status === "downloading") ?? activeJobs[0];
  const thumbnail = activeJob?.metadata?.thumbnail ?? null;
  const pct = activeJob?.progress?.percentage ?? 0;
  const indeterminate =
    pct < 100 &&
    !!activeJob &&
    (activeJob.status === "queued" ||
      activeJob.status === "paused" ||
      (activeJob.status === "downloading" &&
        !jobHasDownloadTransferStarted(activeJob)));

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative hover:opacity-90 transition-opacity"
      style={{ width: CHIP_SIZE, height: CHIP_SIZE }}
      aria-label={`${count} download${count !== 1 ? "s" : ""} in progress. Click to expand.`}
      title="Expand downloads"
    >
      <TrackOrb
        key={`dock-${activeJob?.id ?? "active"}-${activeJob?.status ?? "idle"}`}
        thumbnail={thumbnail}
        title={activeJob?.metadata?.title ?? "Downloading"}
        pct={pct}
        indeterminate={indeterminate}
        size={CHIP_SIZE}
      />

      <span
        className="absolute inset-0 flex items-center justify-center rounded-full pointer-events-none"
        style={{ background: "rgb(0 0 0 / 0.42)" }}
      >
        <span
          className="text-[10px] font-bold tabular-nums leading-none select-none"
          style={{ color: "#fff", textShadow: "0 1px 3px rgb(0 0 0 / 0.9)" }}
        >
          {count > 99 ? "99+" : count}
        </span>
      </span>
    </button>
  );
}

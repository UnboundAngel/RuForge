import { useMemo } from "react";
import { Download } from "lucide-react";
import { jobHasDownloadTransferStarted, type DownloadJob } from "@/downloadQueue";
import { useMusicDownloadCelebrations } from "@/hooks/useMusicDownloadCelebrations";
import {
  activeDownloadJobs,
  activeDownloadsLabel,
  averageDownloadPct,
  noneTransferStarted,
} from "@/lib/activeDownloadJobs";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useHotkeyLabel } from "@/hooks/useHotkeys";
import { extractYouTubeVideoId } from "@/youtubeUrl";
import { ToolsInstallRing, ToolsRailIcon, useToolsRailTooltip } from "./ToolsInstallRing";
import { newestPendingArrival, useLibraryArrivals } from "@/components/library/libraryArrivals";
import {
  isPlaylistRunJob,
  jobThumbnailUrl,
  pendingPlaylistArrivals,
  usePlaylistArrivals,
} from "@/lib/playlistFlyTargets";
import { DownloadThumbStack } from "./DownloadThumbStack";
import { usePlaylistArrivalLanding } from "./usePlaylistArrivalLanding";

const SIZE = 40;
const THUMB = 29;
const STROKE = 2.5;

function jobThumb(job: DownloadJob | undefined, url: string): string | null {
  const fromMeta = job?.metadata?.thumbnail?.trim();
  if (fromMeta) return fromMeta;
  const videoId = extractYouTubeVideoId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

type VideoDownloadRailButtonProps = {
  overlayOpen: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export function VideoDownloadRailButton({
  overlayOpen,
  disabled,
  onToggle,
}: VideoDownloadRailButtonProps) {
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const downloadKey = useHotkeyLabel("library.toggleDownloader") ?? undefined;
  const toolsTooltip = useToolsRailTooltip();
  const celebrating = useMusicDownloadCelebrations(downloadJobs);
  const activeJobs = useMemo(
    () =>
      downloadJobs.filter(
        (j) =>
          j.status === "queued" ||
          j.status === "downloading" ||
          j.status === "paused",
      ),
    [downloadJobs],
  );
  const arrivals = useLibraryArrivals((s) => s.arrivals);
  // A finished download holds the chip until its card is on screen, so the flight has a chip to leave from.
  const waiting = useMemo(
    () => (activeJobs.length === 0 && celebrating == null ? newestPendingArrival(arrivals) : null),
    [activeJobs.length, celebrating, arrivals],
  );
  usePlaylistArrivalLanding();
  const playlistGroups = usePlaylistArrivals((s) => s.groups);
  const pendingPlaylist = useMemo(() => pendingPlaylistArrivals(playlistGroups), [playlistGroups]);
  const playlistRunJobs = useMemo(() => activeJobs.filter(isPlaylistRunJob), [activeJobs]);
  // Playlist videos pile up here as they download and stay until they fly into their card.
  const stackSrcs = useMemo(() => {
    const live = playlistRunJobs.find((j) => j.status === "downloading") ?? playlistRunJobs[0];
    const srcs = [
      live ? jobThumbnailUrl(live) : null,
      ...pendingPlaylist.map((a) => a.image?.src ?? null),
    ].filter((src): src is string => Boolean(src));
    return [...new Set(srcs)];
  }, [playlistRunJobs, pendingPlaylist]);
  const stacked = playlistRunJobs.length > 0 || pendingPlaylist.length > 0;
  const hasWork =
    activeJobs.length > 0 || celebrating != null || waiting != null || pendingPlaylist.length > 0;
  const showChip = hasWork && !overlayOpen;
  const activeJob =
    activeJobs.find((j) => j.status === "downloading") ??
    activeJobs.find((j) => j.status === "queued") ??
    activeJobs[0];
  const running = activeDownloadJobs(activeJobs);
  const multi = running.length > 1 && celebrating == null;
  const title = stacked && activeJobs.length === 0 && celebrating == null
    ? "Playlist downloads"
    : waiting
    ? (waiting.arrival.title ?? "Download finished")
    : (celebrating?.title ??
      (multi ? activeDownloadsLabel(running, () => "") : null) ??
      activeJob?.metadata?.title ??
      activeJob?.title ??
      "Downloading");
  const thumbnail = stacked && stackSrcs[0]
    ? stackSrcs[0]
    : waiting
    ? waiting.arrival.thumbnail
    : jobThumb(activeJob, celebrating?.url ?? activeJob?.url ?? "");
  const pct = waiting || (stacked && activeJobs.length === 0)
    ? 100
    : celebrating
      ? celebrating.kind === "complete" || celebrating.kind === "cancel"
        ? 100
        : clampPct(celebrating.startPct ?? 0)
      : multi
        ? clampPct(averageDownloadPct(running))
        : clampPct(activeJob?.progress?.percentage ?? 0);
  const indeterminate =
    !celebrating &&
    !!activeJob &&
    pct < 100 &&
    (multi
      ? noneTransferStarted(running)
      : activeJob.status === "queued" ||
      activeJob.status === "paused" ||
      (activeJob.status === "downloading" &&
        !jobHasDownloadTransferStarted(activeJob)));
  const r = (SIZE - STROKE) / 2 - 1;
  const c = 2 * Math.PI * r;
  const dash = indeterminate ? c * 0.28 : (pct / 100) * c;
  const count = stacked
    ? activeJobs.length + pendingPlaylist.length
    : waiting
      ? waiting.count
      : activeJobs.length;

  if (showChip) {
    return (
      <button
        type="button"
        data-rail-tab="downloader"
        data-tooltip="Expand downloads"
        data-tooltip-side="right"
        data-tooltip-shortcut={downloadKey}
        onClick={onToggle}
        disabled={disabled}
        aria-label={`${title}. Expand preview.`}
        className="group/rail relative flex h-[var(--rf-rail-btn)] w-[var(--rf-rail-btn)] items-center justify-center rounded-xl text-[color:var(--accent)]"
      >
        {stacked && stackSrcs.length > 0 ? (
          <DownloadThumbStack srcs={stackSrcs} size={THUMB} count={count} />
        ) : (
        <span
          className="relative flex items-center justify-center overflow-hidden rounded-full bg-[color:var(--rf-surface-deep)]"
          style={{ width: THUMB, height: THUMB }}
        >
          {thumbnail ? (
            <img src={thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <Download size={14} className="text-stone-400" />
          )}
          {count > 1 ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[9px] font-bold tabular-nums text-white">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </span>
        )}
        <svg
          width={SIZE}
          height={SIZE}
          className="pointer-events-none absolute -rotate-90"
          aria-hidden
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke="rgb(255 255 255 / 0.12)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            className={indeterminate ? "origin-center animate-spin" : undefined}
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-rail-tab="downloader"
      data-tooltip={toolsTooltip ?? "Download"}
      data-tooltip-side="right"
      data-tooltip-shortcut={toolsTooltip ? undefined : downloadKey}
      onClick={onToggle}
      disabled={disabled}
      aria-label={toolsTooltip ?? "Download"}
      aria-current={overlayOpen ? "page" : undefined}
      className={cn(
        "group/rail relative flex h-[var(--rf-rail-btn)] w-[var(--rf-rail-btn)] items-center justify-center rounded-xl transition-colors duration-150",
        overlayOpen
          ? "text-[color:var(--accent)]"
          : "text-stone-500 hover:text-stone-200",
      )}
    >
      {overlayOpen ? (
        <span
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[color:var(--accent)]"
          aria-hidden
        />
      ) : null}
      <ToolsInstallRing />
      <ToolsRailIcon />
    </button>
  );
}

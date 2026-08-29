import { useMemo } from "react";
import { Download } from "lucide-react";
import { jobHasDownloadTransferStarted, type DownloadJob } from "@/downloadQueue";
import { useMusicDownloadCelebrations } from "@/hooks/useMusicDownloadCelebrations";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { RadialNavIcon } from "@/components/navigation/RadialNavIcon";
import { extractYouTubeVideoId } from "@/youtubeUrl";

const SIZE = 44;
const THUMB = 32;
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
  const hasWork = activeJobs.length > 0 || celebrating != null;
  const showChip = hasWork && !overlayOpen;
  const activeJob =
    activeJobs.find((j) => j.status === "downloading") ??
    activeJobs.find((j) => j.status === "queued") ??
    activeJobs[0];
  const title =
    celebrating?.title ??
    activeJob?.metadata?.title ??
    activeJob?.title ??
    "Downloading";
  const thumbnail = jobThumb(
    activeJob,
    celebrating?.url ?? activeJob?.url ?? "",
  );
  const pct = celebrating
    ? celebrating.kind === "complete" || celebrating.kind === "cancel"
      ? 100
      : clampPct(celebrating.startPct ?? 0)
    : clampPct(activeJob?.progress?.percentage ?? 0);
  const indeterminate =
    !celebrating &&
    !!activeJob &&
    pct < 100 &&
    (activeJob.status === "queued" ||
      activeJob.status === "paused" ||
      (activeJob.status === "downloading" &&
        !jobHasDownloadTransferStarted(activeJob)));
  const r = (SIZE - STROKE) / 2 - 1;
  const c = 2 * Math.PI * r;
  const dash = indeterminate ? c * 0.28 : (pct / 100) * c;
  const count = activeJobs.length;

  if (showChip) {
    return (
      <button
        type="button"
        data-rail-tab="downloader"
        onClick={onToggle}
        disabled={disabled}
        aria-label={`${title}. Expand preview.`}
        className="group/rail relative flex h-11 w-11 items-center justify-center rounded-xl text-[color:var(--accent)]"
      >
        <span className="rf-rail-tooltip absolute left-[calc(100%+10px)] top-1/2 z-[280] -translate-y-1/2 opacity-0 group-hover/rail:opacity-100">
          Expand downloads
        </span>
        <span
          className="relative flex items-center justify-center overflow-hidden rounded-full bg-[#1D1613]"
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
      onClick={onToggle}
      disabled={disabled}
      aria-label="Download"
      aria-current={overlayOpen ? "page" : undefined}
      className={cn(
        "group/rail relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-150",
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
      <RadialNavIcon id="download" size={20} />
      <span className="rf-rail-tooltip absolute left-[calc(100%+10px)] top-1/2 z-[280] -translate-y-1/2 opacity-0 group-hover/rail:opacity-100">
        Download
      </span>
    </button>
  );
}

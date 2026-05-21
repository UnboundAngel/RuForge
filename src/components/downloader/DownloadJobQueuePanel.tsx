import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Clock,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Library,
} from "lucide-react";
import {
  downloadJobMediaNeedsHydration,
  downloadJobsQueueOrderFingerprint,
  type DownloadJob,
} from "../../downloadQueue";
import { useRuforgeStore } from "../../store/ruforgeStore";
import {
  DOWNLOAD_JOB_STATUS_LABEL,
  downloadProgressPhaseLabel,
  RF_DOWNLOADER_PANEL,
} from "./downloaderConstants";
import { downloadJobDisplayFileSizeBytes } from "../../downloadJobFileSizes";
import { formatApproxFileSize } from "./downloaderFormat";

function formatQueueApproxSize(job: DownloadJob): string | null {
  const bytes = downloadJobDisplayFileSizeBytes(
    job.metadata,
    job.options.audioOnly === true,
  );
  if (typeof bytes !== "number" || bytes <= 0) return null;
  const label = formatApproxFileSize(Math.round(bytes));
  return label ? `~${label}` : null;
}

function formatQueueTransferText(job: DownloadJob): string | null {
  if (job.status !== "downloading" || !job.progress) return null;
  const p = job.progress;
  const totalFromProgress = typeof p.totalBytes === "number" && p.totalBytes > 0 ? p.totalBytes : null;
  const displayBytes = downloadJobDisplayFileSizeBytes(
    job.metadata,
    job.options.audioOnly === true,
  );
  const totalFromMeta =
    typeof displayBytes === "number" && displayBytes > 0
      ? Math.round(displayBytes)
      : null;
  const total =
    totalFromProgress != null && totalFromMeta != null
      ? Math.max(totalFromProgress, totalFromMeta)
      : (totalFromProgress ?? totalFromMeta);
  let downloaded =
    typeof p.downloadedBytes === "number" && p.downloadedBytes >= 0
      ? Math.round(p.downloadedBytes)
      : null;
  if (downloaded == null && total != null && typeof p.percentage === "number") {
    const pct = Math.min(100, Math.max(0, p.percentage));
    downloaded = Math.round((pct / 100) * total);
  }
  if (total == null || downloaded == null) return null;
  return `${formatApproxFileSize(downloaded)} / ${formatApproxFileSize(total)}`;
}

export const DownloadQueueItem = ({
  item,
  index,
  currentIndex,
  percentage,
}: {
  item: { id?: string; thumbnail: string };
  index: number;
  currentIndex?: number;
  percentage: number;
}) => {
  const isCompleted = currentIndex !== undefined && index < currentIndex;
  const isCurrent = currentIndex !== undefined && index === currentIndex;
  const isPending = currentIndex !== undefined && index > currentIndex;
  const opacityClass = isPending ? "opacity-60" : "opacity-100";
  const progress = isCompleted ? 100 : isCurrent ? percentage : 0;
  return (
    <motion.div
      className={`relative aspect-video w-64 shrink-0 overflow-hidden rounded-3xl border border-white/5 bg-stone-900 shadow-2xl transition-all duration-500 ${isCurrent ? "z-10 scale-105 ring-2 ring-[color-mix(in_srgb,var(--accent),transparent_50%)]" : `scale-100 ${opacityClass}`}`}
    >
      <img src={item.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale" />
      <motion.div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}>
        <img src={item.thumbnail} alt="" className="h-full w-full object-cover shadow-[0_0_40px_var(--accent-glow)]" />
      </motion.div>
    </motion.div>
  );
};

export function UrlInputPacer({
  expanded,
  loading = false,
  compact = false,
  className = "",
}: {
  expanded: boolean;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const lineHeight = compact ? "h-px" : "h-[2px]";
  const gap = compact ? "gap-1" : "gap-1.5";
  const wide = compact ? "w-14" : "w-48";
  const lineWidth = expanded ? wide : "w-0";
  return (
    <motion.div className={`flex items-center justify-center ${gap} ${className}`}>
      <motion.div
        className={`${lineHeight} rounded-full bg-[color:var(--accent)] opacity-30 transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${lineWidth}`}
      />
      {loading && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className={`${compact ? "h-2 w-2 border" : "h-3 w-3 border-2"} border-white/10 border-t-[color:var(--accent)] rounded-full`}
        />
      )}
      <motion.div
        className={`${lineHeight} rounded-full bg-[color:var(--accent)] opacity-30 transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${lineWidth}`}
      />
    </motion.div>
  );
}

/** Shared per-job audio toggle (queue row + downloader hero). */
export function DownloadJobAudioToggle({
  audioOnly,
  onToggle,
  disabled = false,
  className = "",
}: {
  audioOnly: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [audioHovered, setAudioHovered] = useState(false);
  return (
    <motion.div className={`relative ${className}`}>
      <QueueTooltip
        text={audioOnly ? "Switch to audio + video" : "Switch to audio only"}
        visible={audioHovered && !disabled}
      />
      <button
        type="button"
        disabled={disabled}
        onMouseEnter={() => setAudioHovered(true)}
        onMouseLeave={() => setAudioHovered(false)}
        onClick={onToggle}
        aria-pressed={audioOnly}
        aria-label={audioOnly ? "Switch to video download" : "Switch to audio-only download"}
        className={`flex h-[26px] w-[26px] items-center justify-center rounded-md p-1.5 text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-25 ${
          audioOnly
            ? "bg-[color:var(--accent)] text-[#1D1613] hover:bg-[color-mix(in_srgb,var(--accent),white_12%)]"
            : "text-[#EDD79C]/35 hover:bg-white/5 hover:text-[#EDD79C]/70"
        }`}
      >
        A
      </button>
    </motion.div>
  );
}

const QueueTooltip = ({ text, visible }: { text: string; visible: boolean }) => (
  <AnimatePresence mode="wait">
    {visible && (
      <motion.div
        initial={{ opacity: 0, y: 5, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 2, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#1D1613]/95 px-2.5 py-1.5 text-[10px] font-bold font-mono text-[#EDD79C] shadow-2xl backdrop-blur-md"
      >
        <motion.span
          key={text}
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(2px)" }}
          transition={{ duration: 0.15 }}
        >
          {text}
        </motion.span>
      </motion.div>
    )}
  </AnimatePresence>
);

const QueueIconButton = ({
  icon: Icon,
  onClick,
  variant = "ghost",
  tooltip,
  disabled = false,
}: {
  icon: typeof Trash2;
  onClick: () => void | Promise<void>;
  variant?: "ghost" | "accent";
  tooltip: string;
  disabled?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div className="relative">
      <QueueTooltip text={tooltip} visible={isHovered && !disabled} />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`rounded-md p-1.5 transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-25 ${
          variant === "accent"
            ? "text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_92%)]"
            : "text-[#EDD79C]/35 hover:bg-white/5 hover:text-[#EDD79C]/70"
        }`}
      >
        <Icon size={14} strokeWidth={2} />
      </button>
    </div>
  );
};

function queuePanelShouldShow(jobs: DownloadJob[]): boolean {
  if (jobs.length === 0) return false;
  return jobs.some((j) => j.status !== "completed" && j.status !== "failed");
}

const DownloadJobRow = ({
  job,
  index,
  total,
  focusedJobId,
  onFocusRow,
  onConfirmPending,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onReorder,
  onToggleAudio,
}: {
  job: DownloadJob;
  index: number;
  total: number;
  focusedJobId: string | null;
  onFocusRow: (id: string) => void;
  onConfirmPending: (jobId: string, approve: boolean) => void;
  onPause: (id: string) => void | Promise<void>;
  onResume: (id: string) => void | Promise<void>;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void | Promise<void>;
  onReorder: (from: number, to: number) => void;
  onToggleAudio: (id: string, audioOnly: boolean) => void;
}) => {
  const pct = job.progress?.percentage;
  const pendingApproval = job.status === "queued" && job.approval === "pending";
  const canReorder = job.status === "queued" || job.status === "paused";
  const canEditAudio = canReorder;
  const canRemove = ["queued", "paused", "failed", "completed", "skipped"].includes(
    job.status,
  );
  const audioOnly = job.options.audioOnly === true;
  const isFocused = focusedJobId === job.id;
  const statusTone =
    job.status === "downloading"
      ? "text-[color:var(--accent)]/80"
      : job.status === "failed"
        ? "text-[#EDD79C]/35"
        : job.status === "completed"
          ? "text-[#EDD79C]/55"
          : job.status === "skipped"
            ? "text-[#EDD79C]/60"
            : "text-[#EDD79C]/45";
  const StatusIcon =
    job.status === "downloading"
      ? Loader2
      : job.status === "paused"
        ? Pause
        : job.status === "completed"
          ? CheckCircle2
          : job.status === "failed"
            ? AlertCircle
            : job.status === "skipped"
              ? Library
              : Clock;
  const metaTitle = job.metadata?.title?.trim();
  const shortTitle = job.title?.trim();
  const needsMeta = downloadJobMediaNeedsHydration(job.metadata);
  /** Title/thumb can arrive separately; only show "Loading…" when nothing usable yet. */
  const awaitingListMeta = needsMeta && !metaTitle && !shortTitle;
  const displayTitle = metaTitle || shortTitle || (awaitingListMeta ? "Loading…" : "Video");
  const transferLabel = formatQueueTransferText(job);
  const approxSizeLabel =
    transferLabel == null && job.status !== "downloading"
      ? formatQueueApproxSize(job)
      : null;
  const thumbUrl = job.metadata?.thumbnail?.trim();
  const statusLabel =
    pendingApproval
      ? `${DOWNLOAD_JOB_STATUS_LABEL[job.status]} · confirm`
      : job.status === "queued" && job.approval === "manual"
        ? `${DOWNLOAD_JOB_STATUS_LABEL[job.status]} · manual`
        : job.status === "queued" && job.approval === "held"
          ? `${DOWNLOAD_JOB_STATUS_LABEL[job.status]} · staged`
          : job.status === "downloading"
            ? downloadProgressPhaseLabel(job.progress, job.metadata?.isPlaylist)
            : DOWNLOAD_JOB_STATUS_LABEL[job.status];
  return (
    <motion.li
      role="button"
      tabIndex={0}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onFocusRow(job.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFocusRow(job.id);
        }
      }}
      className={`group relative rounded-xl border border-white/5 bg-[#1D1613]/50 px-3.5 py-2.5 pr-9 text-left transition-colors hover:bg-[#271C18]/40 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/50 cursor-pointer ${
        job.status === "downloading"
          ? "border-[color-mix(in_srgb,var(--accent),transparent_88%)]"
          : job.status === "skipped"
            ? "border-white/10 bg-[#1D1613]/35"
            : ""
      } ${isFocused ? "ring-2 ring-[color-mix(in_srgb,var(--accent),transparent_55%)]" : ""}`}
    >
      <motion.div className="flex items-start gap-2">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-stone-950/80 ring-1 ring-white/5">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-1 text-center text-[7px] font-black uppercase leading-tight tracking-tight text-[#EDD79C]/25">
              {awaitingListMeta ? "…" : "-"}
            </div>
          )}
        </div>
        <motion.div className="min-w-0 flex-1 space-y-1 pb-5">
          <motion.div className="flex items-baseline gap-2">
            <p
              className="truncate text-[12px] font-semibold leading-snug text-[#EDD79C]/90"
              title={metaTitle || shortTitle || job.url}
            >
              {displayTitle}
            </p>
            {job.status === "downloading" && typeof pct === "number" && (
              <span className="shrink-0 text-[10px] font-mono tabular-nums text-[color:var(--accent)]/70">
                {pct.toFixed(0)}%
              </span>
            )}
          </motion.div>
          <motion.div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold tracking-wide ${statusTone}`}>
              <StatusIcon
                size={11}
                strokeWidth={2}
                className={job.status === "downloading" ? "animate-spin opacity-70" : "opacity-60"}
              />
              {statusLabel}
            </span>
            {transferLabel != null && (
              <span className="text-[9px] font-bold tabular-nums text-[#EDD79C]/30">{transferLabel}</span>
            )}
            {approxSizeLabel != null && (
              <span className="text-[9px] font-bold tabular-nums text-[#EDD79C]/30">{approxSizeLabel}</span>
            )}
            <span className="text-[9px] font-bold text-[#EDD79C]/30">
              {" · "}{audioOnly ? "audio" : "video"}
            </span>
            {job.error && (
              <p className="max-w-[14rem] truncate text-[9px] font-bold text-[#EDD79C]/30" title={job.error}>
                {job.error}
              </p>
            )}
          </motion.div>
          {pendingApproval && (
            <div
              className="flex flex-wrap items-center gap-2 pt-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              <span className="text-[8px] font-bold uppercase tracking-wider text-[#EDD79C]/45">
                Add to auto-queue?
              </span>
              <button
                type="button"
                onClick={() => onConfirmPending(job.id, true)}
                className="rounded-md bg-[color:var(--accent)] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#1D1613]"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onConfirmPending(job.id, false)}
                className="rounded-md border border-white/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#EDD79C]/70"
              >
                No
              </button>
            </div>
          )}
        </motion.div>
        <motion.div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
          onKeyDown={(e) => e.stopPropagation()}
        >
          {canEditAudio && (
            <DownloadJobAudioToggle
              audioOnly={audioOnly}
              onToggle={() => onToggleAudio(job.id, !audioOnly)}
            />
          )}
          {job.status === "downloading" && (
            <QueueIconButton icon={Pause} onClick={() => void onPause(job.id)} tooltip="Pause" />
          )}
          {job.status === "paused" && (
            <QueueIconButton
              icon={Play}
              onClick={() => void onResume(job.id)}
              tooltip="Resume"
              variant="accent"
            />
          )}
          {job.status === "failed" && (
            <QueueIconButton icon={RefreshCw} onClick={() => onRetry(job.id)} tooltip="Retry" />
          )}
          {canRemove && (
            <QueueIconButton icon={Trash2} onClick={() => void onRemove(job.id)} tooltip="Remove from queue" />
          )}
        </motion.div>
      </motion.div>
      {canReorder && (
        <motion.div
          className="absolute bottom-1.5 right-1.5 flex flex-col overflow-hidden rounded-md border border-white/5 bg-[#1D1613]/80"
          role="group"
          aria-label="Reorder in queue"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={index === 0}
            title="Move up"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(index, index - 1);
            }}
            className="px-1 py-0.5 text-[#EDD79C]/40 transition-colors hover:bg-white/5 hover:text-[#EDD79C]/75 disabled:pointer-events-none disabled:opacity-20"
          >
            <ChevronUp size={11} strokeWidth={2.5} />
          </button>
          <motion.div className="h-px bg-white/5" />
          <button
            type="button"
            disabled={index === total - 1}
            title="Move down"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(index, index + 1);
            }}
            className="px-1 py-0.5 text-[#EDD79C]/40 transition-colors hover:bg-white/5 hover:text-[#EDD79C]/75 disabled:pointer-events-none disabled:opacity-20"
          >
            <ChevronDown size={11} strokeWidth={2.5} />
          </button>
        </motion.div>
      )}
      {job.status === "downloading" && typeof pct === "number" && (
        <div className="absolute bottom-0 left-3 right-3 h-[3px] overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full bg-[color-mix(in_srgb,var(--accent),transparent_35%)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.12, ease: "linear" }}
          />
        </div>
      )}
    </motion.li>
  );
};

export const DownloadJobQueuePanel = () => {
  const jobsRaw = useRuforgeStore((s) => s.downloadJobs);
  const sortFingerprint = useRuforgeStore((s) => downloadJobsQueueOrderFingerprint(s.downloadJobs));
  const jobMembershipKey = jobsRaw
    .map((j) => j.id)
    .sort()
    .join("|");
  const sortedJobIds = useMemo(() => {
    if (sortFingerprint === "") return [];
    return jobsRaw.map((j) => j.id);
    // sortFingerprint: physical order; jobMembershipKey: id set so removes cannot leave stale ids in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jobsRaw omitted so progress/metadata alone do not rebuild
  }, [sortFingerprint, jobMembershipKey]);
  const jobs = useMemo(() => {
    if (sortedJobIds.length === 0) return jobsRaw;
    const byId = new Map(jobsRaw.map((j) => [j.id, j]));
    const ordered: DownloadJob[] = [];
    for (const id of sortedJobIds) {
      const job = byId.get(id);
      if (job) ordered.push(job);
    }
    // Jobs present in store but not yet in the memoized id list (rare); keep them visible.
    if (ordered.length < jobsRaw.length) {
      const seen = new Set(ordered.map((j) => j.id));
      for (const j of jobsRaw) {
        if (!seen.has(j.id)) ordered.push(j);
      }
    }
    return ordered;
  }, [sortedJobIds, jobsRaw]);
  const focusedJobId = useRuforgeStore((s) => s.focusedJobId);
  const setDownloaderFocusedJobId = useRuforgeStore((s) => s.setDownloaderFocusedJobId);
  const confirmPendingDownloadJob = useRuforgeStore((s) => s.confirmPendingDownloadJob);
  const pauseDownloadJob = useRuforgeStore((s) => s.pauseDownloadJob);
  const resumeDownloadJob = useRuforgeStore((s) => s.resumeDownloadJob);
  const retryDownloadJob = useRuforgeStore((s) => s.retryDownloadJob);
  const removeDownloadJob = useRuforgeStore((s) => s.removeDownloadJob);
  const reorderDownloadJobs = useRuforgeStore((s) => s.reorderDownloadJobs);
  const setDownloadJobAudioOnly = useRuforgeStore((s) => s.setDownloadJobAudioOnly);
  if (!queuePanelShouldShow(jobsRaw)) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mx-auto mt-6 w-full max-w-lg px-4 py-3.5 text-left ${RF_DOWNLOADER_PANEL}`}
    >
      <motion.div className="mb-3 px-0.5 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#EDD79C]">Download queue</p>
        <p className="mt-1 text-[9px] text-[#EDD79C]/40">
          {jobsRaw.length} {jobsRaw.length === 1 ? "job" : "jobs"}
        </p>
      </motion.div>
      <ul className="space-y-2">
        {jobs.map((job, index) => (
          <DownloadJobRow
            key={job.id}
            job={job}
            index={index}
            total={jobs.length}
            focusedJobId={focusedJobId}
            onFocusRow={setDownloaderFocusedJobId}
            onConfirmPending={confirmPendingDownloadJob}
            onPause={pauseDownloadJob}
            onResume={resumeDownloadJob}
            onRetry={retryDownloadJob}
            onRemove={removeDownloadJob}
            onReorder={reorderDownloadJobs}
            onToggleAudio={setDownloadJobAudioOnly}
          />
        ))}
      </ul>
    </motion.div>
  );
};

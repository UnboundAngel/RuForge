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
} from "lucide-react";
import type { DownloadJob } from "../../downloadQueue";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { DOWNLOAD_JOB_STATUS_LABEL, RF_DOWNLOADER_PANEL } from "./downloaderConstants";

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
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={tooltip}
    className={`rounded-md p-1.5 transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-25 ${
      variant === "accent"
        ? "text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_92%)]"
        : "text-[#EDD79C]/35 hover:bg-white/5 hover:text-[#EDD79C]/70"
    }`}
  >
    <Icon size={14} strokeWidth={2} />
  </button>
);

const DownloadJobRow = ({
  job,
  index,
  total,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onReorder,
}: {
  job: DownloadJob;
  index: number;
  total: number;
  onPause: (id: string) => void | Promise<void>;
  onResume: (id: string) => void | Promise<void>;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void | Promise<void>;
  onReorder: (from: number, to: number) => void;
}) => {
  const pct = job.progress?.percentage;
  const canReorder = job.status === "queued" || job.status === "paused";
  const canRemove = ["queued", "paused", "failed", "completed"].includes(job.status);
  const statusTone =
    job.status === "downloading"
      ? "text-[color:var(--accent)]/80"
      : job.status === "failed"
        ? "text-[#EDD79C]/35"
        : job.status === "completed"
          ? "text-[#EDD79C]/55"
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
            : Clock;
  const displayTitle = (job.title ?? job.url).trim();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99 }}
      className={`group relative rounded-xl border border-white/5 bg-[#1D1613]/50 px-3.5 py-2.5 pr-9 transition-colors hover:bg-[#271C18]/40 ${
        job.status === "downloading" ? "border-[color-mix(in_srgb,var(--accent),transparent_88%)]" : ""
      }`}
    >
      <motion.div className="flex items-start gap-2">
        <motion.div className="min-w-0 flex-1 space-y-1 pb-5">
          <motion.div className="flex items-baseline gap-2">
            <p className="truncate text-[12px] font-semibold leading-snug text-[#EDD79C]/90" title={displayTitle}>
              {displayTitle}
            </p>
            {job.status === "downloading" && typeof pct === "number" && (
              <span className="shrink-0 text-[10px] font-mono tabular-nums text-[color:var(--accent)]/70">
                {pct.toFixed(0)}%
              </span>
            )}
          </motion.div>
          <motion.div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`inline-flex items-center gap-1 text-[9px] font-medium tracking-wide ${statusTone}`}>
              <StatusIcon
                size={11}
                strokeWidth={2}
                className={job.status === "downloading" ? "animate-spin opacity-70" : "opacity-60"}
              />
              {DOWNLOAD_JOB_STATUS_LABEL[job.status]}
            </span>
            {job.status === "downloading" && job.progress?.speed && (
              <span className="text-[9px] tabular-nums text-[#EDD79C]/30">{job.progress.speed}</span>
            )}
            {job.error && (
              <p className="max-w-[14rem] truncate text-[9px] text-[#EDD79C]/30" title={job.error}>
                {job.error}
              </p>
            )}
          </motion.div>
        </motion.div>
        <motion.div className="flex shrink-0 items-center gap-0.5">
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
        >
          <button
            type="button"
            disabled={index === 0}
            title="Move up"
            onClick={() => onReorder(index, index - 1)}
            className="px-1 py-0.5 text-[#EDD79C]/40 transition-colors hover:bg-white/5 hover:text-[#EDD79C]/75 disabled:pointer-events-none disabled:opacity-20"
          >
            <ChevronUp size={11} strokeWidth={2.5} />
          </button>
          <motion.div className="h-px bg-white/5" />
          <button
            type="button"
            disabled={index === total - 1}
            title="Move down"
            onClick={() => onReorder(index, index + 1)}
            className="px-1 py-0.5 text-[#EDD79C]/40 transition-colors hover:bg-white/5 hover:text-[#EDD79C]/75 disabled:pointer-events-none disabled:opacity-20"
          >
            <ChevronDown size={11} strokeWidth={2.5} />
          </button>
        </motion.div>
      )}
      {job.status === "downloading" && typeof pct === "number" && (
        <div className="absolute bottom-0 left-3 right-3 h-px overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full bg-[color-mix(in_srgb,var(--accent),transparent_35%)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          />
        </div>
      )}
    </motion.li>
  );
};

export const DownloadJobQueuePanel = () => {
  const jobs = useRuforgeStore((s) => s.downloadJobs);
  const pauseDownloadJob = useRuforgeStore((s) => s.pauseDownloadJob);
  const resumeDownloadJob = useRuforgeStore((s) => s.resumeDownloadJob);
  const retryDownloadJob = useRuforgeStore((s) => s.retryDownloadJob);
  const removeDownloadJob = useRuforgeStore((s) => s.removeDownloadJob);
  const reorderDownloadJobs = useRuforgeStore((s) => s.reorderDownloadJobs);
  if (jobs.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mx-auto mt-6 w-full max-w-lg px-4 py-3.5 text-left ${RF_DOWNLOADER_PANEL}`}
    >
      <motion.div className="mb-3 px-0.5 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#EDD79C]">Download queue</p>
        <p className="mt-1 text-[9px] text-[#EDD79C]/40">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </p>
      </motion.div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {jobs.map((job, index) => (
            <DownloadJobRow
              key={job.id}
              job={job}
              index={index}
              total={jobs.length}
              onPause={pauseDownloadJob}
              onResume={resumeDownloadJob}
              onRetry={retryDownloadJob}
              onRemove={removeDownloadJob}
              onReorder={reorderDownloadJobs}
            />
          ))}
        </AnimatePresence>
      </ul>
    </motion.div>
  );
};

import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
  Music,
  Video,
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
} from "./downloaderConstants";
import { downloadJobDisplayFileSizeBytes } from "../../downloadJobFileSizes";
import { formatApproxFileSize } from "./downloaderFormat";

const THUMB_CROSSFADE = { duration: 0.32, ease: [0.23, 1, 0.32, 1] as const };
const QUEUE_DRAWER_EASE = [0.23, 1, 0.32, 1] as const;
const QUEUE_DRAWER_WIDTH = 360;

function computeTooltipPlacement(
  anchor: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
): { top: number; left: number; transform: string } {
  const pad = 10;
  const gap = 8;
  const vw = window.innerWidth;
  const tw = Math.max(tooltipWidth, 1);
  const th = Math.max(tooltipHeight, 1);

  const preferAbove = anchor.top - gap - th >= pad;
  const top = preferAbove ? anchor.top - gap : anchor.bottom + gap;
  const translateY = preferAbove ? "-100%" : "0";

  const centerX = anchor.left + anchor.width / 2;
  const half = tw / 2;

  let left = centerX;
  let translateX = "-50%";

  if (centerX - half < pad) {
    left = anchor.left;
    translateX = "0";
  } else if (centerX + half > vw - pad) {
    left = anchor.right;
    translateX = "-100%";
  }

  return { top, left, transform: `translate(${translateX}, ${translateY})` };
}

/** Crossfade when `src` changes (queue row / downloader hero). Visual only. */
export function CrossfadeThumbImage({
  src,
  alt = "",
  wrapperClassName = "",
  imgClassName = "h-full w-full object-cover",
}: {
  src: string;
  alt?: string;
  wrapperClassName?: string;
  imgClassName?: string;
}) {
  const key = src.trim();
  if (!key) return null;
  return (
    <div className={`relative overflow-hidden ${wrapperClassName}`}>
      <AnimatePresence mode="sync" initial={false}>
        <motion.img
          key={key}
          src={key}
          alt={alt}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={THUMB_CROSSFADE}
          className={`absolute inset-0 ${imgClassName}`}
        />
      </AnimatePresence>
    </div>
  );
}

/** Smooth crossfading backdrop with custom active hover state inside Framer Motion. */
export function CrossfadeBackdropImage({
  src,
  isHovered,
}: {
  src: string;
  isHovered: boolean;
}) {
  const key = src.trim();
  if (!key) return null;
  return (
    <div className="absolute inset-0 z-0 overflow-hidden rounded-xl pointer-events-none">
      <AnimatePresence mode="sync" initial={false}>
        <motion.img
          key={key}
          src={key}
          alt=""
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: isHovered ? 0.22 : 0.13, scale: isHovered ? 1.025 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          className="absolute inset-0 h-full w-full object-cover blur-[6px] saturate-[1.2]"
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-[#1D1613]/94 via-[#1D1613]/88 to-[#1D1613]/94" />
    </div>
  );
}

/** Marquee text that animates when title overflows its container boundaries. */
export const MarqueeText = ({
  text,
  className = "",
  layoutKey,
  centered = false,
}: {
  text: string;
  className?: string;
  layoutKey?: boolean | number | string;
  /** Center the text when it fits without scrolling. */
  centered?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldMarquee, setShouldMarquee] = useState(false);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        const isOverflowing = textRef.current.offsetWidth > containerRef.current.offsetWidth;
        setShouldMarquee(isOverflowing);
      }
    };
    check();
    const t = setTimeout(check, 120);
    window.addEventListener("resize", check);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", check);
    };
  }, [text, layoutKey]);

  return (
    <div ref={containerRef} className={`${className} overflow-hidden whitespace-nowrap`}>
      <div
        className={`flex w-max ${shouldMarquee ? "animate-marquee" : ""}`}
        style={centered && !shouldMarquee ? { margin: "0 auto" } : undefined}
      >
        <span ref={textRef} className={shouldMarquee ? "pr-12" : ""}>{text}</span>
        {shouldMarquee && <span className="pr-12">{text}</span>}
      </div>
    </div>
  );
};

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const IconComponent = audioOnly ? Music : Video;
  return (
    <motion.div className={`relative ${className}`}>
      <QueueTooltip
        text={audioOnly ? "Switch to audio + video" : "Switch to audio only"}
        visible={audioHovered && !disabled}
        anchorRef={buttonRef}
      />
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onMouseEnter={() => setAudioHovered(true)}
        onMouseLeave={() => setAudioHovered(false)}
        onClick={onToggle}
        aria-label={audioOnly ? "Switch to video download" : "Switch to audio-only download"}
        className="flex h-7 w-7 items-center justify-center rounded-md p-1.5 text-[#EDD79C]/40 transition-colors hover:bg-white/5 hover:text-[#EDD79C]/75 active:scale-95 disabled:pointer-events-none disabled:opacity-25"
      >
        <IconComponent
          size={13}
          strokeWidth={2.5}
          className={audioOnly ? "opacity-90" : "opacity-70"}
        />
      </button>
    </motion.div>
  );
}

const QueueTooltip = ({
  text,
  visible,
  anchorRef,
}: {
  text: string;
  visible: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}) => {
  const measureRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    transform: string;
  } | null>(null);

  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      const tip = measureRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const tw = tip?.offsetWidth ?? 0;
      const th = tip?.offsetHeight ?? 0;
      if (tw === 0 || th === 0) return;
      setPlacement(computeTooltipPlacement(r, tw, th));
    };
    update();
    const raf = requestAnimationFrame(() => requestAnimationFrame(update));
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible, anchorRef, text]);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 whitespace-nowrap rounded-lg border border-white/10 bg-[#1D1613]/95 px-2.5 py-1.5 text-[10px] font-bold font-mono text-[#EDD79C] opacity-0"
      >
        {text}
      </div>
      {placement ? (
        <div
          style={{
            position: "fixed",
            top: placement.top,
            left: placement.left,
            transform: placement.transform,
            zIndex: 10000,
          }}
          className="pointer-events-none whitespace-nowrap rounded-lg border border-white/10 bg-[#1D1613]/95 px-2.5 py-1.5 text-[10px] font-bold font-mono text-[#EDD79C] shadow-2xl backdrop-blur-md"
        >
          {text}
        </div>
      ) : null}
    </>,
    document.body,
  );
};

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      <QueueTooltip text={tooltip} visible={isHovered && !disabled} anchorRef={buttonRef} />
      <button
        ref={buttonRef}
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
  return jobs.some(
    (j) =>
      j.status !== "completed" &&
      j.status !== "failed" &&
      j.status !== "timed_out" &&
      j.status !== "skipped",
  );
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
  const [isHovered, setIsHovered] = useState(false);
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative overflow-visible rounded-xl border border-white/5 bg-[#1D1613]/40 py-2.5 text-left transition-colors hover:bg-[#271C18]/30 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/50 cursor-pointer ${
        job.status === "downloading"
          ? "border-[color-mix(in_srgb,var(--accent),transparent_85%)]"
          : job.status === "skipped"
            ? "border-white/10 bg-[#1D1613]/25"
            : ""
      } ${thumbUrl ? "pl-[84px]" : "pl-3.5"} pr-3.5 ${
        isHovered || isFocused ? "z-[60]" : "z-10"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        {/* Background faded and blurred thumbnail crossfader */}
        {thumbUrl && (
          <CrossfadeBackdropImage src={thumbUrl} isHovered={isHovered} />
        )}

      {/* Morphing Left Thumbnail Bleed (No hard-bordered box) */}
      {thumbUrl ? (
        <div
          className="absolute left-0 top-0 bottom-0 w-[72px] overflow-hidden rounded-l-xl pointer-events-none z-10"
          style={{
            maskImage: "linear-gradient(to right, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 100%)",
          }}
        >
          <CrossfadeThumbImage
            src={thumbUrl}
            wrapperClassName="h-full w-full"
            imgClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </div>
      ) : null}

        {/* Selected glowing outline overlay overlay */}
        <div
          className={`absolute inset-0 z-30 rounded-xl border transition-all duration-300 ${
            isFocused
              ? "border-[color:var(--accent)] shadow-[0_0_12px_var(--accent-glow)] opacity-100"
              : "border-transparent opacity-0"
          }`}
        />
      </div>

      <motion.div className="relative z-10 flex items-center justify-between gap-3 h-full">
        {/* Left Side: Metadata and Title */}
        <motion.div className="min-w-0 flex-1 space-y-0.5 pb-1">
          <motion.div className="flex items-baseline gap-2 min-w-0">
            {!thumbUrl && (
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded bg-stone-950/80 mr-1 flex items-center justify-center">
                <div className="text-center text-[7px] font-black uppercase leading-tight tracking-tight text-[#EDD79C]/25">
                  {awaitingListMeta ? "…" : "-"}
                </div>
              </div>
            )}
            <MarqueeText
              text={displayTitle}
              className="text-[12px] font-semibold leading-snug text-[#EDD79C]/90 flex-1 min-w-0"
              layoutKey={isFocused}
            />
          </motion.div>

          <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#EDD79C]/50 truncate">
            <span>{statusLabel}</span>
            {(transferLabel || approxSizeLabel) && (
              <>
                <span className="text-[#EDD79C]/20">•</span>
                <span className="font-mono text-[9.5px]">{transferLabel || approxSizeLabel}</span>
              </>
            )}
            <span className="text-[#EDD79C]/20">•</span>
            <span className="text-[9.5px]">{audioOnly ? "audio" : "video"}</span>
          </div>

          {job.error && (
            <p className="max-w-[14rem] truncate text-[9px] font-bold text-red-400/70" title={job.error}>
              {job.error}
            </p>
          )}

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

        {/* Right Side: Dynamic Actions / Status Panel */}
        <div className="relative z-20 flex shrink-0 items-center justify-end min-w-[36px] h-9 pr-1 overflow-visible">
          <AnimatePresence mode="wait">
            {isHovered || isFocused ? (
              <motion.div
                key="actions"
                initial={{ opacity: 0, x: 8, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 4, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                {canReorder && index > 0 && (
                  <QueueIconButton
                    icon={ChevronUp}
                    onClick={() => onReorder(index, index - 1)}
                    tooltip="Move up"
                  />
                )}
                {canReorder && index < total - 1 && (
                  <QueueIconButton
                    icon={ChevronDown}
                    onClick={() => onReorder(index, index + 1)}
                    tooltip="Move down"
                  />
                )}
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
            ) : (
              <motion.div
                key="status"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                {job.status === "downloading" && typeof pct === "number" ? (
                  <span className="text-[11px] font-mono font-black tabular-nums text-[color:var(--accent)] tracking-tight">
                    {pct.toFixed(0)}%
                  </span>
                ) : (
                  <StatusIcon
                    size={13}
                    strokeWidth={2.5}
                    className={`${statusTone} opacity-60`}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {job.status === "downloading" && typeof pct === "number" && (
        <div className="absolute bottom-0 left-0 right-0 h-[4px] overflow-hidden rounded-b-xl bg-white/5">
          <motion.div
            className="h-full bg-[color:var(--accent)] shadow-[0_0_10px_var(--accent-glow)]"
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
  }, [sortFingerprint, jobMembershipKey]);
  const jobs = useMemo(() => {
    if (sortedJobIds.length === 0) return jobsRaw;
    const byId = new Map(jobsRaw.map((j) => [j.id, j]));
    const ordered: DownloadJob[] = [];
    for (const id of sortedJobIds) {
      const job = byId.get(id);
      if (job) ordered.push(job);
    }
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

  const [isExpanded, setIsExpanded] = useState(true);
  const [drawerRightInset, setDrawerRightInset] = useState(16);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setDrawerRightInset(mq.matches ? 24 : 16);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const drawerTransition = { duration: 0.3, ease: QUEUE_DRAWER_EASE };

  if (!queuePanelShouldShow(jobsRaw)) return null;

  return (
    <motion.div
      className="fixed bottom-4 z-[200] pointer-events-auto"
      initial={false}
      animate={{ right: isExpanded ? drawerRightInset : 0 }}
      transition={drawerTransition}
    >
      <div
        className={`flex flex-row items-stretch overflow-hidden border border-white/5 bg-[#271C18]/92 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md ${
          isExpanded ? "rounded-2xl" : "rounded-l-xl"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsExpanded((open) => !open)}
          aria-label={isExpanded ? "Collapse download queue" : "Expand download queue"}
          className={`flex w-9 shrink-0 bg-transparent p-0 transition-[background-color] duration-200 hover:bg-white/[0.02] ${
            isExpanded ? "self-stretch border-r border-white/5" : "min-h-[80px]"
          }`}
        />

        <motion.div
          initial={false}
          animate={{
            width: isExpanded ? QUEUE_DRAWER_WIDTH : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={drawerTransition}
          className="overflow-hidden"
          style={{ pointerEvents: isExpanded ? "auto" : "none" }}
          aria-hidden={!isExpanded}
        >
          <div
            className="p-4 text-left"
            style={{
              width: QUEUE_DRAWER_WIDTH,
              maxWidth: "min(360px, calc(100vw - 3rem - 36px))",
            }}
          >
            <div className="mb-4 min-h-[32px] pr-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#EDD79C]">
                Download queue
              </h3>
              <p className="mt-0.5 text-[9px] text-[#EDD79C]/40">
                {jobsRaw.length} {jobsRaw.length === 1 ? "job active" : "jobs active"}
              </p>
            </div>

            <ul className="max-h-[300px] sm:max-h-[380px] overflow-y-auto overflow-x-visible space-y-2 pr-0.5">
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
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

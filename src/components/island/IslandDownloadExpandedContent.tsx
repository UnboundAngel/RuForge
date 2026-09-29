import { motion, useReducedMotion } from "motion/react";
import { ArrowDown } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";

import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import type { IslandDownload, IslandDownloadJob } from "./IslandDownloadContent";

const PAD = 14;
const HEADER_H = 20;
const HEADER_GAP = 10;
const ROW_H = 44;
const ROW_GAP = 4;

export function islandDownloadExpandedDims(rows: number) {
  const n = Math.max(1, rows);
  return {
    width: 350,
    height: PAD * 2 + HEADER_H + HEADER_GAP + n * ROW_H + (n - 1) * ROW_GAP,
    borderRadius: 24,
  };
}

function statusLabel(job: IslandDownloadJob): string {
  if (job.status === "paused") return "Paused";
  if (job.status === "queued") return "Queued";
  return job.pct != null ? `${Math.round(job.pct)}%` : "Starting";
}

function DownloadRow({ job }: { job: IslandDownloadJob }) {
  const live = job.status === "downloading" && job.pct != null;
  return (
    <li className="flex min-w-0 items-center gap-2.5" style={{ height: ROW_H }}>
      <span className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06] text-stone-500">
        {job.thumbnail ? (
          <img src={job.thumbnail} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <ArrowDown size={14} strokeWidth={2.5} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <HoverMarqueeText text={job.title} slow className="text-[12px] font-semibold leading-tight text-stone-100" />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            {live ? (
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--accent)] transition-[width] duration-300 ease-linear motion-reduce:transition-none"
                style={{ width: `${job.pct}%` }}
              />
            ) : null}
          </span>
          <span
            className={`w-12 shrink-0 text-right text-[10px] font-semibold tabular-nums ${
              live ? "text-stone-300" : "text-stone-500"
            }`}
          >
            {statusLabel(job)}
          </span>
        </div>
      </div>
    </li>
  );
}

export function IslandDownloadExpandedContent({
  download,
  accentColor,
  onOpenDownloads,
}: {
  download: IslandDownload;
  accentColor: string;
  onOpenDownloads: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const total = download.remaining + 1;
  const hidden = total - download.jobs.length;
  const open = (e: MouseEvent) => {
    e.stopPropagation();
    onOpenDownloads();
  };

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: reduceMotion ? { duration: 0 } : { duration: 0.2, delay: 0.1 } }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.95, transition: { duration: reduceMotion ? 0 : 0.15 } }}
      className="pointer-events-auto absolute inset-0 flex min-h-0 flex-col"
      style={{ padding: PAD, "--accent": accentColor } as CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-2" style={{ height: HEADER_H, marginBottom: HEADER_GAP }}>
        <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-stone-100">
          {total === 1 ? "Downloading" : `Downloading ${total}`}
          {hidden > 0 ? <span className="ml-1.5 font-medium text-stone-500">+{hidden} more</span> : null}
        </p>
        <button
          type="button"
          onClick={open}
          className="shrink-0 text-[11px] font-semibold text-stone-400 transition-colors duration-150 hover:text-[color:var(--accent)] motion-reduce:transition-none"
        >
          Open downloads
        </button>
      </header>
      <ul className="flex min-h-0 flex-col" style={{ gap: ROW_GAP }}>
        {download.jobs.map((job) => (
          <DownloadRow key={job.key} job={job} />
        ))}
      </ul>
    </motion.div>
  );
}

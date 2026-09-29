import { motion } from "motion/react";
import { ArrowDown, Loader2 } from "lucide-react";

export type IslandDownloadJob = {
  key: string;
  title: string;
  thumbnail: string | null;
  /** 0-100 once bytes flow; null while connecting, queued, or paused. */
  pct: number | null;
  status: "downloading" | "queued" | "paused";
};

export type IslandDownload = {
  /** Active job id; keys the thumbnail swap between queued songs. */
  key: string;
  title: string;
  thumbnail: string | null;
  /** 0-100 once bytes flow; null while connecting, queued, or paused. */
  pct: number | null;
  /** Songs still queued behind the active one. */
  remaining: number;
  /** Active job first, for the expanded list. */
  jobs: IslandDownloadJob[];
};

export const DOWNLOAD_ISLAND_WIDTH = 280;

export function IslandDownloadContent({ download }: { download: IslandDownload }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, delay: 0.1 } }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
      className="pointer-events-none absolute inset-0 flex items-center gap-2.5 pl-1.5 pr-3.5"
      role="status"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-stone-300">
        {download.thumbnail ? (
          <img key={download.key} src={download.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <ArrowDown size={13} strokeWidth={2.5} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-stone-100">{download.title}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tabular-nums text-stone-400">
        {download.pct != null ? `${Math.round(download.pct)}%` : <Loader2 size={12} className="animate-spin" />}
        {download.remaining > 0 ? <span className="text-stone-500">+{download.remaining}</span> : null}
      </span>
    </motion.div>
  );
}

/**
 * Download progress traced around the pill edge. Geometry is CSS so it follows the shell's
 * spring width without re-measuring.
 */
export function IslandProgressRing({
  pct,
  radius,
  color,
}: {
  pct: number | null;
  radius: number;
  color: string;
}) {
  const rect = {
    x: 1,
    y: 1,
    rx: Math.max(0, radius - 1),
    ry: Math.max(0, radius - 1),
    fill: "none",
    strokeWidth: 2,
    pathLength: 1,
    style: { width: "calc(100% - 2px)", height: "calc(100% - 2px)" },
  };
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <rect {...rect} stroke="rgb(255 255 255 / 0.1)" />
      {pct != null ? (
        <rect
          {...rect}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={1 - Math.min(100, Math.max(0, pct)) / 100}
          style={{ ...rect.style, transition: "stroke-dashoffset 300ms linear" }}
        />
      ) : (
        <rect {...rect} stroke={color} strokeLinecap="round" className="rf-island-ring-indeterminate" />
      )}
    </svg>
  );
}

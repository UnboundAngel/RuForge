import type { IslandDownload, IslandDownloadJob } from "@/components/island/IslandDownloadContent";
import { jobHasDownloadTransferStarted, type DownloadJob } from "@/downloadQueue";

export const ISLAND_DOWNLOAD_MAX_ROWS = 3;

function toIslandJob(job: DownloadJob): IslandDownloadJob {
  const flowing = job.status === "downloading" && jobHasDownloadTransferStarted(job);
  return {
    key: job.id,
    title: job.metadata?.title || "Downloading",
    thumbnail: job.metadata?.thumbnail ?? null,
    pct: flowing ? Math.min(100, Math.max(0, job.progress?.percentage ?? 0)) : null,
    status: job.status === "downloading" ? "downloading" : job.status === "paused" ? "paused" : "queued",
  };
}

export function buildIslandDownload(jobs: readonly DownloadJob[]): IslandDownload | null {
  const active = jobs.filter(
    (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
  );
  if (active.length === 0) return null;
  const rank = (j: DownloadJob) => (j.status === "downloading" ? 0 : j.status === "queued" ? 1 : 2);
  const ordered = [...active].sort((a, b) => rank(a) - rank(b));
  const lead = toIslandJob(ordered[0]);
  return {
    key: lead.key,
    title: lead.title,
    thumbnail: lead.thumbnail,
    pct: lead.pct,
    remaining: active.length - 1,
    jobs: ordered.slice(0, ISLAND_DOWNLOAD_MAX_ROWS).map(toIslandJob),
  };
}

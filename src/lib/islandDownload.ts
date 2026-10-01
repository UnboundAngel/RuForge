import type { IslandDownload, IslandDownloadJob } from "@/components/island/IslandDownloadContent";
import { jobHasDownloadTransferStarted, type DownloadJob } from "@/downloadQueue";
import { useRuforgeStore } from "@/store/ruforgeStore";

export const ISLAND_DOWNLOAD_MAX_ROWS = 3;

/** Paused, or queued but held for the user (cold restart / batch hold / duplicate prompt). */
function waitsForUser(job: DownloadJob): boolean {
  return (
    job.status === "paused" ||
    (job.status === "queued" && (job.approval === "held" || job.approval === "pending"))
  );
}

function toIslandJob(job: DownloadJob): IslandDownloadJob {
  const flowing =
    (job.status === "downloading" && jobHasDownloadTransferStarted(job)) ||
    (job.status === "paused" && (job.progress?.percentage ?? 0) > 0);
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
    waiting: waitsForUser(ordered[0]),
    remaining: active.length - 1,
    jobs: ordered.slice(0, ISLAND_DOWNLOAD_MAX_ROWS).map(toIslandJob),
  };
}

/** Start the island's lead job the same way the downloader's own controls would. */
export function startIslandDownload(jobId: string): void {
  const s = useRuforgeStore.getState();
  const job = s.downloadJobs.find((j) => j.id === jobId);
  if (!job) return;
  if (job.status === "paused") {
    void s.resumeDownloadJob(jobId);
  } else if (job.status === "queued" && job.approval === "pending") {
    s.confirmPendingDownloadJob(jobId, true);
  } else if (job.status === "queued" && job.approval === "held") {
    s.releaseHeldDownloadJobs();
    s.pumpDownloadQueue();
  }
}

import { jobHasDownloadTransferStarted, type DownloadJob } from "@/downloadQueue";

function clampPct(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, n));
}

/** Jobs transferring right now. The queue runs several at once, so surfaces must not pick one. */
export function activeDownloadJobs(jobs: readonly DownloadJob[]): DownloadJob[] {
  return jobs.filter((j) => j.status === "downloading");
}

/** Average fraction across the given jobs, 0 to 100. */
export function averageDownloadPct(jobs: readonly DownloadJob[]): number {
  if (jobs.length === 0) return 0;
  let sum = 0;
  for (const j of jobs) sum += clampPct(j.progress?.percentage);
  return sum / jobs.length;
}

/** True while no job in the list has received its first bytes. */
export function noneTransferStarted(jobs: readonly DownloadJob[]): boolean {
  return jobs.every((j) => !jobHasDownloadTransferStarted(j));
}

/** Label for chips: the job title when one is active, a count when several are. */
export function activeDownloadsLabel(
  jobs: readonly DownloadJob[],
  titleOf: (job: DownloadJob) => string,
): string | null {
  if (jobs.length === 0) return null;
  return jobs.length === 1 ? titleOf(jobs[0]) : `${jobs.length} downloading`;
}

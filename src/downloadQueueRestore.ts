import { loadPersistedDownloadJobs, type DownloadJob } from "./downloadQueue";

/**
 * Rehydrate the in-memory queue from the saved queue file (launch, HMR, tab churn). Jobs added
 * before the file finished loading stay, and saved jobs they do not already cover are added back.
 */
export function restoreDownloadQueueFromSessionIfEmpty(
  currentJobs: readonly DownloadJob[],
  currentFocus: string | null,
): { downloadJobs: DownloadJob[]; focusedJobId: string | null } | null {
  const ids = new Set(currentJobs.map((j) => j.id));
  const urls = new Set(currentJobs.map((j) => j.url));
  const missing = loadPersistedDownloadJobs().filter((j) => !ids.has(j.id) && !urls.has(j.url));
  if (missing.length === 0) return null;
  const downloadJobs = [...missing, ...currentJobs];
  const focusedJobId =
    currentFocus && downloadJobs.some((j) => j.id === currentFocus)
      ? currentFocus
      : downloadJobs.find((j) => j.status === "paused")?.id ??
        downloadJobs.find((j) => j.status === "queued")?.id ??
        null;
  return { downloadJobs, focusedJobId };
}

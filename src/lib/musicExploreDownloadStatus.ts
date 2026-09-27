import type { DownloadJob } from "@/downloadQueue";
import { youtubeUrlsMatch } from "@/youtubeUrl";

export type MusicExploreTrackDownloadUi =
  | "idle"
  | "queued"
  | "downloading"
  | "failed"
  | "timed_out"
  /** Queued but held back by the storage gate; not counted as active so the row reads as stuck. */
  | "no_storage";

function matchingJobs(jobs: DownloadJob[], trackUrl: string): DownloadJob[] {
  return jobs.filter((j) => youtubeUrlsMatch(j.url, trackUrl));
}

export function musicExploreTrackDownloadUi(
  jobs: DownloadJob[],
  trackUrl: string,
): MusicExploreTrackDownloadUi {
  const matches = matchingJobs(jobs, trackUrl);
  if (matches.length === 0) return "idle";
  if (matches.some((j) => j.status === "failed")) return "failed";
  if (matches.some((j) => j.status === "timed_out")) return "timed_out";
  if (matches.some((j) => j.status === "downloading")) return "downloading";
  if (matches.some((j) => j.status === "queued" && j.storageBlock)) return "no_storage";
  if (matches.some((j) => j.status === "queued" || j.status === "paused")) {
    return "queued";
  }
  return "idle";
}

export function isActiveMusicExploreDownloadUi(
  ui: MusicExploreTrackDownloadUi,
): boolean {
  return ui === "queued" || ui === "downloading";
}

export function countActivePlaylistDownloads(
  jobs: DownloadJob[],
  items: { url: string }[],
): number {
  let n = 0;
  for (const item of items) {
    if (isActiveMusicExploreDownloadUi(musicExploreTrackDownloadUi(jobs, item.url))) {
      n += 1;
    }
  }
  return n;
}

export function jobWasActive(job: DownloadJob): boolean {
  return (
    job.status === "queued" ||
    job.status === "downloading" ||
    job.status === "paused"
  );
}

import type { DownloadJob } from "@/downloadQueue";
import { youtubeUrlsMatch } from "@/youtubeUrl";

export type MusicExploreTrackDownloadUi =
  | "idle"
  | "queued"
  | "downloading"
  | "failed";

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
  if (matches.some((j) => j.status === "downloading")) return "downloading";
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

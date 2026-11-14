import type { DownloadJob } from "../../downloadQueue";

/** Playlist runs start concurrently, so playlist position decides card order, not start time. */
export function compareBatchQueueJobs(a: DownloadJob, b: DownloadJob): number {
  const ai = a.options.playlistIndex;
  const bi = b.options.playlistIndex;
  if (
    typeof ai === "number" &&
    typeof bi === "number" &&
    a.options.playlistOutputFolder === b.options.playlistOutputFolder
  ) {
    return ai - bi;
  }
  return a.createdAt - b.createdAt;
}

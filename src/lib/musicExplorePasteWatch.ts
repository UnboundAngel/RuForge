import { findLibraryDuplicate } from "@/duplicateDownload";
import type { DownloadJob } from "@/downloadQueue";
import type { GalleryEntry } from "@/types";
import { extractYouTubeVideoId } from "@/youtubeUrl";

export type PastedExploreWatchDecision = "library" | "active" | "enqueue";

function isActiveWatchJob(jobs: DownloadJob[], videoId: string): boolean {
  return jobs.some((j) => {
    if (extractYouTubeVideoId(j.url) !== videoId) return false;
    return j.status === "queued" || j.status === "downloading" || j.status === "paused";
  });
}

export function decidePastedExploreWatch(args: {
  url: string;
  entries: GalleryEntry[];
  jobs: DownloadJob[];
}): PastedExploreWatchDecision {
  if (findLibraryDuplicate(args.url, args.entries)) return "library";
  const videoId = extractYouTubeVideoId(args.url);
  if (videoId && isActiveWatchJob(args.jobs, videoId)) return "active";
  return "enqueue";
}

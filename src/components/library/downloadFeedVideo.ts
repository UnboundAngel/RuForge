import { buildDownloadJobOptions, patchDownloadJobOptionsForAudio, resolveDownloadOutputDir } from "@/downloadQueue";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { FeedVideo } from "./youtubeFeed";

/** Queues a feed video as a video, even when the downloader is set to audio only: this is the video library. */
export function downloadFeedVideo(video: FeedVideo): void {
  const s = useRuforgeStore.getState();
  const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir, s.internalVault);
  const opts = patchDownloadJobOptionsForAudio(buildDownloadJobOptions(s.settings, dir), false, s.settings);
  s.enqueueDownload(video.url, opts, {
    title: video.title,
    snapshot: {
      title: video.title,
      thumbnail: video.thumbnail ?? "",
      duration: video.duration ?? 0,
      isPlaylist: false,
    },
    enqueueSource: "libraryFeedAdd",
  });
  s.pumpDownloadQueue();
}

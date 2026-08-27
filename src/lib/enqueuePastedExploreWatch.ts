import {
  buildDownloadJobOptions,
  patchDownloadJobOptionsForAudio,
  resolveDownloadOutputDir,
} from "@/downloadQueue";
import { decidePastedExploreWatch, type PastedExploreWatchDecision } from "@/lib/musicExplorePasteWatch";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { extractYouTubeVideoId } from "@/youtubeUrl";

/** Enqueue a pasted single-track Explore URL without opening the sidebar. */
export async function enqueuePastedExploreWatch(
  url: string,
): Promise<PastedExploreWatchDecision> {
  await useRuforgeStore.getState().ensureGalleryOnViewMount();
  const s = useRuforgeStore.getState();
  const decision = decidePastedExploreWatch({
    url,
    entries: s.entries,
    jobs: s.downloadJobs,
  });
  if (decision === "library") {
    s.notify("This track is already in your library.");
    return decision;
  }
  if (decision === "active") return decision;

  const videoId = extractYouTubeVideoId(url);
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
  const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir, s.internalVault);
  const base = buildDownloadJobOptions(s.settings, dir);
  const opts = patchDownloadJobOptionsForAudio(base, true, s.settings);
  s.enqueueDownload(watchUrl, opts, { approval: "auto" });
  s.releaseHeldDownloadJobs();
  s.pumpDownloadQueue();
  return "enqueue";
}

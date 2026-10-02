import { findLibraryDuplicate } from "@/duplicateDownload";
import {
  buildDownloadJobOptions,
  patchDownloadJobOptionsForAudio,
  resolveDownloadOutputDir,
} from "@/downloadQueue";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MusicExploreAutoSaveQueue } from "./musicExploreAutoSave";

/** The store side of Music Explore auto-save: one audio job per track, nothing else released. */
export function musicExploreAutoSaveQueue(videoId: string, title?: string | null): MusicExploreAutoSaveQueue {
  return {
    jobs: () => useRuforgeStore.getState().downloadJobs,
    inLibrary: (url) => findLibraryDuplicate(url, useRuforgeStore.getState().entries) != null,
    enqueue: (url) => {
      const s = useRuforgeStore.getState();
      const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir, s.internalVault);
      const opts = patchDownloadJobOptionsForAudio(buildDownloadJobOptions(s.settings, dir), true, s.settings);
      s.enqueueDownload(url, opts, {
        title: title ?? undefined,
        approval: "auto",
        snapshot: {
          title: title?.trim() || videoId,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0,
          isPlaylist: false,
        },
      });
      s.pumpDownloadQueue();
    },
  };
}

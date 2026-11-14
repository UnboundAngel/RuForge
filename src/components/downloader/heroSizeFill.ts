import {
  cookieContextFromSettings,
  downloadJobSnapshotToVideoInfo,
  videoInfoToDownloadJobSnapshot,
  type DownloadJobMediaSnapshot,
} from "../../downloadQueue";
import { ytdlpVideoFormatForMetadata } from "../../downloadFormat";
import {
  downloadJobDualSizesReady,
  mergeVideoInfoFileSizes,
  snapshotWithResolvedFileSize,
} from "../../downloadJobFileSizes";
import { commitDownloadJobMetadataCache, downloadJobMetadataCacheKey } from "../../downloadQueueMetadataCache";
import { fetchVideoInfoWithTimeout } from "../../downloadVideoInfoFetch";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { youtubeUrlsMatch } from "../../youtubeUrl";

/** Fetches the sizes a cached or job-seeded hero lacks and folds them into the hero. */
export function fillHeroSizesInBackground(
  url: string,
  seedSnap: DownloadJobMediaSnapshot,
  isActive: () => boolean,
): void {
  if (downloadJobDualSizesReady(seedSnap)) return;
  void (async () => {
    try {
      const { settings } = useRuforgeStore.getState();
      const videoFormat = ytdlpVideoFormatForMetadata(settings.preferredQuality);
      const audioOnly = settings.downloadAudioOnly;
      const info = await fetchVideoInfoWithTimeout(
        url,
        videoFormat,
        audioOnly,
        cookieContextFromSettings(settings),
      );
      if (!isActive() || useRuforgeStore.getState().url.trim() !== url) return;
      const snap = mergeVideoInfoFileSizes(videoInfoToDownloadJobSnapshot(info, audioOnly), info, audioOnly);
      const cacheKey = downloadJobMetadataCacheKey(url, videoFormat);
      if (cacheKey) commitDownloadJobMetadataCache(cacheKey, snap);
      const st = useRuforgeStore.getState();
      if (
        !st.videoInfoUrl ||
        !youtubeUrlsMatch(url, st.videoInfoUrl) ||
        st.videoInfoPreferredQuality !== st.settings.preferredQuality
      ) {
        return;
      }
      st.setVideoInfo(downloadJobSnapshotToVideoInfo(snapshotWithResolvedFileSize(snap, audioOnly)), {
        sourceUrl: url,
        preferredQuality: st.settings.preferredQuality,
      });
    } catch (e: unknown) {
      console.error(`[RuForge] hero size fill failed: ${e}`);
    }
  })();
}

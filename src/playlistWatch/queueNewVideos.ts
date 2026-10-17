import { buildDownloadJobOptions, patchDownloadJobOptionsForAudio } from "@/downloadQueue";
import { storageBlocksNewDownloads } from "@/lib/storageBlocks";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { NotificationItem } from "@/notifications/types";
import { playlistVideoUrl } from "./recordToItem";

/** Downloads land in the playlist's own folder so the sidecar and the library group keep them together. */
export function queuePlaylistVideos(item: NotificationItem): boolean {
  const pl = item.ref.playlist;
  if (!pl || pl.videos.length === 0) return false;
  const s = useRuforgeStore.getState();
  if (storageBlocksNewDownloads(s)) return false;
  const opts = {
    ...patchDownloadJobOptionsForAudio(buildDownloadJobOptions(s.settings, pl.outputDir), false, s.settings),
    playlistOutputFolder: pl.folderName,
  };
  for (const v of pl.videos) {
    s.enqueueDownload(playlistVideoUrl(v.id), opts, {
      title: v.title,
      snapshot: {
        title: v.title,
        thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        duration: 0,
        isPlaylist: false,
      },
      enqueueSource: "watchlistAdd",
    });
  }
  s.pumpDownloadQueue();
  return true;
}

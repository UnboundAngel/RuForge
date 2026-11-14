import { buildDownloadJobOptions, patchDownloadJobOptionsForAudio } from "@/downloadQueue";
import { rememberPlaylistFolderTitle } from "@/lib/playlistFlyTargets";
import { STORAGE_FULL_NOTIFY, storageBlocksNewDownloads } from "@/lib/storageBlocks";
import { prepareVideoPlaylistFolderDetailed } from "@/lib/videoPlaylistSidecar";
import { playlistIndexWidth } from "@/playlistDownloadPlan";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { NotificationItem } from "@/notifications/types";
import { playlistVideoUrl } from "./recordToItem";

/**
 * Downloads land in the playlist's own folder. The sidecar roster is extended first (it only knows
 * the videos from the original run) and the new files continue the numbering after the old ones.
 */
export function queuePlaylistVideos(item: NotificationItem): boolean {
  const pl = item.ref.playlist;
  if (!pl || pl.videos.length === 0) return false;
  const s = useRuforgeStore.getState();
  if (storageBlocksNewDownloads(s)) {
    s.notify(STORAGE_FULL_NOTIFY, "warning");
    return false;
  }
  void enqueueIntoPlaylistFolder(pl, item.title);
  return true;
}

async function enqueueIntoPlaylistFolder(
  pl: NonNullable<NotificationItem["ref"]["playlist"]>,
  title: string,
): Promise<void> {
  const s = useRuforgeStore.getState();
  const { folder, previousCount } = await prepareVideoPlaylistFolderDetailed({
    outputDir: pl.outputDir,
    title,
    sourceUrl: `https://www.youtube.com/playlist?list=${pl.listId}`,
    items: pl.videos.map((v) => ({ url: playlistVideoUrl(v.id), title: v.title })),
  });
  // The sidecar resolves the real folder by list id, so a renamed folder is still the target.
  const target = folder || pl.folderName;
  rememberPlaylistFolderTitle(target, title);
  const base = patchDownloadJobOptionsForAudio(
    buildDownloadJobOptions(s.settings, pl.outputDir),
    false,
    s.settings,
  );
  const width = playlistIndexWidth(previousCount + pl.videos.length);
  pl.videos.forEach((v, i) => {
    s.enqueueDownload(
      playlistVideoUrl(v.id),
      {
        ...base,
        playlistOutputFolder: target,
        playlistIndex: previousCount + i + 1,
        playlistIndexWidth: width,
      },
      {
        title: v.title,
        snapshot: {
          title: v.title,
          thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
          duration: 0,
          isPlaylist: false,
        },
        enqueueSource: "watchlistAdd",
      },
    );
  });
  s.pumpDownloadQueue();
}

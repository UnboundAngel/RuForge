import { commitLastDownloadBatchRecord, devBatchToolsEnabled } from "../../lib/devLastDownloadBatch";
import { downloadJobSnapshotFromPlaylistItems, type PlaylistEnqueueItem } from "../../playlistDownloadPlan";
import { videoInfoToDownloadJobSnapshot } from "../../downloadQueue";
import type { VideoInfo } from "../../types";

/** Dev replay tooling: records the hero playlist batch before its jobs enqueue. */
export function captureHeroPlaylistBatch(input: {
  videoInfo: VideoInfo | null;
  heroUrl: string;
  heroAudioOnly: boolean;
  overrides: Record<string, boolean>;
  items: PlaylistEnqueueItem[];
  folder: string;
}): void {
  const { videoInfo: vi } = input;
  if (!devBatchToolsEnabled() || !vi) return;
  commitLastDownloadBatchRecord({
    batchKind: "playlist",
    heroUrl: input.heroUrl,
    heroVideoInfo: videoInfoToDownloadJobSnapshot(vi, input.heroAudioOnly),
    playlistItemAudioOverrides: input.overrides,
    items: input.items.map((item) => ({
      url: item.url,
      source: "heroPlaylistDownload",
      approval: "auto",
      snapshot:
        downloadJobSnapshotFromPlaylistItems(item.url, vi.playlistItems ?? [], item.audioOnly) ?? null,
      options: {
        playlistOutputFolder: input.folder,
        playlistIndex: item.index,
        audioOnly: item.audioOnly,
      },
    })),
  });
}

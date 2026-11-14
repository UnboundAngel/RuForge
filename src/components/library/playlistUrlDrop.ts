import { buildDownloadJobOptions, patchDownloadJobOptionsForAudio, resolveDownloadOutputDir } from "@/downloadQueue";
import { filterSupportedYouTubeUrls, parseDroppedUrls } from "@/features/downloader/dropIntake";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { startPlaylistPreviewStream } from "@/lib/playlistPreviewStream";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { PlaylistItem } from "@/types";
import { extractYouTubePlaylistId, extractYouTubeVideoId } from "@/youtubeUrl";
import { linkToDiskPlaylist } from "@/lib/diskPlaylistMeta";
import { addPendingJoin, isFolderTarget, isPendingFor, libraryFileForVideo } from "./pendingJoins";

export type PlaylistUrlDropResult = {
  added: number;
  queued: number;
  skipped: number;
  /** Playlist links that could not be listed. */
  failed: number;
};

export function playlistDropSummary(r: PlaylistUrlDropResult, title: string): string {
  const parts: string[] = [];
  if (r.added) parts.push(`Added ${r.added} to ${title}`);
  if (r.queued) parts.push(`Queued ${r.queued} ${r.queued === 1 ? "video" : "videos"} into ${title}`);
  if (r.skipped) parts.push(`${r.skipped} already there`);
  if (r.failed) parts.push(`Could not read ${r.failed === 1 ? "a playlist link" : `${r.failed} playlist links`}`);
  return parts.length > 0 ? parts.join(". ") : "Nothing to add from that drop";
}

const isShort = (item: PlaylistItem) => /\/shorts\//i.test(item.webpageUrl ?? "");

function itemVideoId(item: PlaylistItem): string | null {
  if (item.id && /^[a-zA-Z0-9_-]{11}$/.test(item.id)) return item.id;
  return item.webpageUrl ? extractYouTubeVideoId(item.webpageUrl) : null;
}

function listPlaylist(url: string): Promise<PlaylistItem[] | null> {
  return new Promise((resolve) => {
    const all: PlaylistItem[] = [];
    startPlaylistPreviewStream({
      url,
      onBatch: (items) => all.push(...items),
      onEnd: (_total, error) => resolve(error && all.length === 0 ? null : all),
    });
  });
}

type Target = { recordId: string; have: (path: string) => boolean; join?: (path: string) => void };

async function addVideo(
  target: Target,
  videoId: string,
  url: string,
  meta: { title: string; thumbnail: string; duration: number },
  result: PlaylistUrlDropResult,
): Promise<void> {
  const s = useRuforgeStore.getState();
  const owned = libraryFileForVideo(videoId);
  if (owned) {
    if (target.have(owned)) result.skipped += 1;
    else {
      if (target.join) target.join(owned);
      else s.addToVirtualPlaylist(target.recordId, [owned]);
      result.added += 1;
    }
    return;
  }
  if (isPendingFor(videoId, target.recordId)) {
    result.skipped += 1;
    return;
  }
  const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir, s.internalVault);
  const opts = patchDownloadJobOptionsForAudio(buildDownloadJobOptions(s.settings, dir), false, s.settings);
  s.enqueueDownload(url, opts, {
    title: meta.title,
    snapshot: { ...meta, isPlaylist: false },
    enqueueSource: "libraryFeedAdd",
  });
  await addPendingJoin(videoId, target.recordId);
  result.queued += 1;
}

/**
 * Same path as a dropped link, for one video picked in the app: owned joins at once, new downloads then joins.
 * `targetId` is a virtual playlist's record id, or a folder playlist's path (the video is linked to it).
 */
export async function addVideoToPlaylist(
  targetId: string,
  videoId: string,
  url: string,
  meta: { title: string; thumbnail: string; duration: number },
  have: (path: string) => boolean,
): Promise<PlaylistUrlDropResult> {
  const result: PlaylistUrlDropResult = { added: 0, queued: 0, skipped: 0, failed: 0 };
  const s = useRuforgeStore.getState();
  const folder = isFolderTarget(targetId);
  const join = folder
    ? (path: string) => {
        result.added += 1;
        void linkToDiskPlaylist(targetId, [path]).then(() => s.refreshVirtualPlaylists());
      }
    : undefined;
  await addVideo({ recordId: targetId, have, join }, videoId, url, meta, result);
  if (result.queued > 0) s.pumpDownloadQueue();
  return result;
}

/** Adds dropped YouTube videos and playlists to a video playlist: owned ones at once, new ones when their download lands. */
export async function dropUrlsOnPlaylist(recordId: string, dataTransfer: DataTransfer): Promise<PlaylistUrlDropResult> {
  const result: PlaylistUrlDropResult = { added: 0, queued: 0, skipped: 0, failed: 0 };
  // Read before any await: the transfer is cleared once the event ends.
  const urls = filterSupportedYouTubeUrls(parseDroppedUrls(dataTransfer));
  const s = useRuforgeStore.getState();
  const record = s.listVirtualPlaylistRecords().find((r) => r.id === recordId);
  if (!record) return result;
  const target: Target = {
    recordId,
    have: (path) =>
      !!s.listVirtualPlaylistRecords().find((r) => r.id === recordId)?.items.some((i) => mediaPathsMatch(i.path, path)),
  };

  for (const url of urls) {
    const videoId = extractYouTubeVideoId(url);
    const listId = extractYouTubePlaylistId(url);
    if (videoId && !(listId && /\/playlist/i.test(url))) {
      await addVideo(target, videoId, url, { title: url, thumbnail: "", duration: 0 }, result);
      continue;
    }
    const items = await listPlaylist(url);
    if (!items) {
      result.failed += 1;
      continue;
    }
    for (const item of items) {
      const id = itemVideoId(item);
      if (!id || isShort(item)) continue;
      await addVideo(
        target,
        id,
        item.webpageUrl || `https://www.youtube.com/watch?v=${id}`,
        { title: item.title, thumbnail: item.thumbnail, duration: item.duration },
        result,
      );
    }
  }
  if (result.queued > 0) s.pumpDownloadQueue();
  return result;
}

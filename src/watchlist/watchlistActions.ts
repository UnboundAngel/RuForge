import { invoke } from "@tauri-apps/api/core";
import { buildDownloadJobOptions, patchDownloadJobOptionsForAudio, resolveDownloadOutputDir } from "@/downloadQueue";
import { explorerNavigateOrReloadScript } from "@/explorerWebviewLifecycle";
import { STORAGE_FULL_NOTIFY, storageBlocksNewDownloads } from "@/lib/storageBlocks";
import { recordStorageFullRefusal } from "@/notifications/sources/downloadItems";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { deliverUserNotification } from "@/systemNotify";
import type { ResolvedChannel, WatchlistSnapshot, WatchlistUpload } from "./types";
import { setWatchlistSnapshot } from "./watchlistStore";

async function commit(cmd: string, args?: Record<string, unknown>): Promise<WatchlistSnapshot> {
  const snapshot = await invoke<WatchlistSnapshot>(cmd, args);
  setWatchlistSnapshot(snapshot);
  return snapshot;
}

export function followChannel(ch: ResolvedChannel): Promise<WatchlistSnapshot> {
  return commit("follow_channel", { channelId: ch.channelId, title: ch.title, handle: ch.handle });
}

export function unfollowChannel(channelId: string): Promise<WatchlistSnapshot> {
  return commit("unfollow_channel", { channelId });
}

export function setAutoDownload(channelId: string, enabled: boolean): Promise<WatchlistSnapshot> {
  return commit("set_channel_auto_download", { channelId, enabled });
}

export function markSeen(videoIds: string[]): Promise<WatchlistSnapshot> {
  return commit("mark_watchlist_seen", { videoIds });
}

export function markAllSeen(): Promise<WatchlistSnapshot> {
  return commit("mark_all_watchlist_seen");
}

export function setCheckInterval(minutes: number): Promise<WatchlistSnapshot> {
  return commit("set_watchlist_check_interval", { minutes });
}

/** Rejects with Rust's user-facing message ("Could not find that channel." and friends). */
export function resolveChannel(input: string): Promise<ResolvedChannel> {
  return invoke<ResolvedChannel>("resolve_watchlist_channel", { input });
}

export async function followFromInput(input: string): Promise<ResolvedChannel> {
  const ch = await resolveChannel(input);
  await followChannel(ch);
  return ch;
}

/** Same options as the Library feed button: always video, never audio only, preferred quality. */
export function enqueueWatchlistUploads(
  uploads: WatchlistUpload[],
  source: "watchlistAdd" | "watchlistAuto",
): { queued: string[]; blocked: boolean } {
  const s = useRuforgeStore.getState();
  if (storageBlocksNewDownloads(s)) return { queued: [], blocked: true };
  if (uploads.length === 0) return { queued: [], blocked: false };
  const dir = resolveDownloadOutputDir(s.saveToInternal, s.outputDir, s.internalVault);
  const opts = patchDownloadJobOptionsForAudio(buildDownloadJobOptions(s.settings, dir), false, s.settings);
  for (const u of uploads) {
    s.enqueueDownload(u.url, opts, {
      title: u.title,
      snapshot: {
        title: u.title,
        thumbnail: u.thumbnail,
        duration: u.durationSec ?? 0,
        isPlaylist: false,
      },
      enqueueSource: source,
    });
  }
  s.pumpDownloadQueue();
  return { queued: uploads.map((u) => u.videoId), blocked: false };
}

/** False when storage refused the add; the upload stays unseen. */
export async function queueUpload(upload: WatchlistUpload): Promise<boolean> {
  const { blocked } = enqueueWatchlistUploads([upload], "watchlistAdd");
  if (blocked) {
    await deliverUserNotification(
      { dedupeKey: "storage-full", body: STORAGE_FULL_NOTIFY, kind: "warning" },
      useRuforgeStore.getState().notify,
    );
    recordStorageFullRefusal();
    return false;
  }
  await markSeen([upload.videoId]);
  return true;
}

export async function openUploadInExplorer(upload: WatchlistUpload): Promise<void> {
  void markSeen([upload.videoId]).catch((e) => console.error("mark_watchlist_seen failed", e));
  const s = useRuforgeStore.getState();
  s.setLastExplorerUrl(upload.url);
  if (s.navMode === "music") s.setNavMode("default");
  if (s.activeTab !== "explorer") {
    // Entering the tab navigates the webview to lastExplorerUrl.
    s.setActiveTab("explorer");
    return;
  }
  // Already on the tab (maybe under Music mode or an overlay): no enter transition, so drive it here.
  s.setActiveTab("explorer");
  try {
    const label = await invoke<string>("embedded_explorer_webview_label");
    await invoke("eval_in_webview", { label, script: explorerNavigateOrReloadScript(upload.url) });
  } catch (e) {
    console.error(e);
  }
}

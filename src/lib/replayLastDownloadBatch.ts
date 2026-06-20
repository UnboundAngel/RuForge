import { getDownloaderReplayHandlers } from "../features/downloader/downloaderReplayRegistry";
import {
  downloadJobSnapshotToVideoInfo,
  type DownloadJob,
} from "../downloadQueue";
import { devReplayCleanupForBatch } from "../devReplayCleanup";
import { useRuforgeStore } from "../store/ruforgeStore";
import { youtubeUrlsMatch } from "../youtubeUrl";
import {
  devBatchToolsEnabled,
  getDevReplayMode,
  readLastDownloadBatchRecord,
  setDevReplaySimulateActive,
  type LastBatchItem,
  type LastDownloadBatchRecord,
} from "./devLastDownloadBatch";

declare global {
  interface Window {
    __rfDevReplayBeforeCleanup?: (record: LastDownloadBatchRecord) => void | Promise<void>;
  }
}

function isDownloadQueueBusy(jobs: DownloadJob[]): boolean {
  return jobs.some(
    (j) =>
      j.status === "queued" ||
      j.status === "downloading" ||
      j.status === "paused",
  );
}

async function waitForHeroMetadata(url: string, timeoutMs = 45_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = useRuforgeStore.getState();
    if (
      st.url.trim() &&
      youtubeUrlsMatch(st.url, url) &&
      st.videoInfo &&
      !st.metadataLoading
    ) {
      return;
    }
    await new Promise<void>((r) => setTimeout(r, 120));
  }
  throw new Error("Hero metadata did not load in time for replay.");
}

async function waitForQueueIdle(timeoutMs = 600_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const jobs = useRuforgeStore.getState().downloadJobs;
    if (!isDownloadQueueBusy(jobs)) return;
    await new Promise<void>((r) => setTimeout(r, 250));
  }
  throw new Error("Download queue did not finish replay in time.");
}

function restorePlaylistHero(record: LastDownloadBatchRecord): void {
  const st = useRuforgeStore.getState();
  const heroUrl = record.heroUrl?.trim() ?? record.items[0]?.url ?? "";
  if (heroUrl) st.setDownloaderUrl(heroUrl);
  if (record.heroVideoInfo) {
    st.setVideoInfo(downloadJobSnapshotToVideoInfo(record.heroVideoInfo), {
      sourceUrl: heroUrl,
    });
  }
  const handlers = getDownloaderReplayHandlers();
  if (record.playlistItemAudioOverrides && handlers?.setPlaylistItemAudioOverrides) {
    handlers.setPlaylistItemAudioOverrides(record.playlistItemAudioOverrides);
  }
}

function restoreSingleHero(item: LastBatchItem, record: LastDownloadBatchRecord): void {
  const st = useRuforgeStore.getState();
  const heroUrl = record.heroUrl?.trim() || item.url;
  st.setDownloaderUrl(heroUrl);
  const snap = item.snapshot ?? record.heroVideoInfo;
  if (snap) {
    st.setVideoInfo(downloadJobSnapshotToVideoInfo(snap), { sourceUrl: heroUrl });
  }
  if (item.source === "heroClipboardPaste") {
    st.setDownloaderUrlSourceHint("clipboard");
    getDownloaderReplayHandlers()?.setClipboardPastedHint?.(true);
  }
}

async function replayEnqueueItem(
  item: LastBatchItem,
  handlers: NonNullable<ReturnType<typeof getDownloaderReplayHandlers>>,
): Promise<void> {
  switch (item.source) {
    case "explorerAdd":
      handlers.replayExplorerAdd(item.url);
      return;
    case "quickEnqueueClipboard":
      await handlers.handleQuickEnqueueFromClipboard(item.url);
      return;
    case "heroUrlStaging": {
      const st = useRuforgeStore.getState();
      const prev = st.url.trim();
      if (prev && !youtubeUrlsMatch(prev, item.url)) {
        handlers.handleUrlChange(prev);
        await new Promise<void>((r) => setTimeout(r, 80));
      }
      handlers.handleUrlChange(item.url);
      handlers.promoteStagedBarToDownloadQueue();
      return;
    }
    case "urlDrop":
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      await handlers.handleDroppedYoutubeUrls([item.url]);
      return;
    default:
      return;
  }
}

async function replaySingleItem(
  item: LastBatchItem,
  record: LastDownloadBatchRecord,
  handlers: NonNullable<ReturnType<typeof getDownloaderReplayHandlers>>,
): Promise<void> {
  switch (item.source) {
    case "heroClipboardPaste":
      handlers.applyClipboardYoutubeUrl(item.url);
      await waitForHeroMetadata(item.url);
      await handlers.handleDownloadClick();
      return;
    case "heroSingleDownload":
    case "heroPlaylistDownload":
      restoreSingleHero(item, record);
      await handlers.handleDownloadClick();
      return;
    case "explorerAdd":
      handlers.replayExplorerAdd(item.url);
      await handlers.handleDownloadClick();
      return;
    case "quickEnqueueClipboard":
      await handlers.handleQuickEnqueueFromClipboard(item.url);
      if (item.approval === "held") await handlers.handleDownloadClick();
      return;
    case "heroUrlStaging":
      await replayEnqueueItem(item, handlers);
      await handlers.handleDownloadClick();
      return;
    case "urlDrop":
      await replayEnqueueItem(item, handlers);
      if (item.approval === "held") await handlers.handleDownloadClick();
      return;
    default:
      restoreSingleHero(item, record);
      await handlers.handleDownloadClick();
  }
}

async function replayBatchRecord(
  record: LastDownloadBatchRecord,
  handlers: NonNullable<ReturnType<typeof getDownloaderReplayHandlers>>,
): Promise<void> {
  useRuforgeStore.getState().setActiveTab("downloader");

  if (record.batchKind === "playlist") {
    restorePlaylistHero(record);
    await handlers.handleDownloadClick();
    return;
  }

  if (record.batchKind === "heldRelease" || record.batchKind === "mixed") {
    for (const item of record.items) {
      await replayEnqueueItem(item, handlers);
    }
    await handlers.handleDownloadClick();
    return;
  }

  if (record.items.length === 1) {
    await replaySingleItem(record.items[0]!, record, handlers);
    return;
  }

  for (const item of record.items) {
    await replaySingleItem(item, record, handlers);
  }
}

export async function replayLastDownloadBatch(): Promise<void> {
  if (!devBatchToolsEnabled()) return;

  const notify = useRuforgeStore.getState().notify;
  const record = readLastDownloadBatchRecord();
  if (!record || record.items.length === 0) {
    notify("No last download batch record to replay.", "warning");
    return;
  }

  const handlers = getDownloaderReplayHandlers();
  if (!handlers) {
    notify("Open the Download tab first so replay handlers are registered.", "warning");
    return;
  }

  if (isDownloadQueueBusy(useRuforgeStore.getState().downloadJobs)) {
    notify("Download queue is busy. Wait for active jobs to finish.", "warning");
    return;
  }

  const simulate = getDevReplayMode() === "simulate";
  setDevReplaySimulateActive(simulate);

  try {
    await replayBatchRecord(record, handlers);
    await waitForQueueIdle();

    if (!simulate) {
      if (import.meta.env.DEV && typeof window.__rfDevReplayBeforeCleanup === "function") {
        await window.__rfDevReplayBeforeCleanup(record);
      }
      const latest = readLastDownloadBatchRecord() ?? record;
      const { deletedPaths, unresolvedUrls } = await devReplayCleanupForBatch(latest, {});
      if (deletedPaths.length > 0) {
        notify(
          `Replay cleanup deleted ${deletedPaths.length} file(s) from resolved output paths.`,
          "info",
        );
      }
      if (unresolvedUrls.length > 0) {
        notify(
          `Replay cleanup skipped ${unresolvedUrls.length} URL(s) with no resolved output path.`,
          "warning",
        );
      }
    } else {
      notify("Simulated batch replay finished (no yt-dlp, no cleanup).", "info");
    }
  } catch (e) {
    notify(`Replay failed: ${String(e)}`, "error");
  } finally {
    setDevReplaySimulateActive(false);
  }
}

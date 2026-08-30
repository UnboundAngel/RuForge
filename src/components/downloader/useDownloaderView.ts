import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
  type ClipboardEvent,
} from "react";
import { fetchVideoInfoWithTimeout } from "../../downloadVideoInfoFetch";
import { cookieContextFromSettings } from "../../downloadQueue";
import { useYtdlpUpdate } from "../../hooks/useYtdlpUpdate";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { browserContextForDownloaderUi } from "../../store/types";
import {
  buildDownloadJobOptions,
  downloadJobMediaNeedsHydration,
  downloadJobSnapshotToVideoInfo,
  jobHasDownloadTransferStarted,
  patchDownloadJobOptionsForAudio,
  videoInfoToDownloadJobSnapshot,
  type DownloadJob,
  type DownloadJobMediaSnapshot,
  type DownloadEnqueueSource,
  type PlaylistBatchEnqueueMeta,
} from "../../downloadQueue";
import {
  downloadJobDualSizesReady,
  mergeVideoInfoFileSizes,
  snapshotWithResolvedFileSize,
} from "../../downloadJobFileSizes";
import {
  commitDownloadJobMetadataCache,
  downloadJobMetadataCacheKey,
  peekDownloadJobMetadataCache,
  peekDownloadJobMetadataCacheForHeroDisplay,
} from "../../downloadQueueMetadataCache";
import { effectiveDownloadSubLangs } from "../../store/types";
import { readClipboardYouTubeUrl } from "../../downloaderClipboardYoutube";
import { findLibraryDuplicate, type DuplicateMatch } from "../../duplicateDownload";
import { applyReplaceBeforeDownload } from "../../replaceLibraryDownload";
import type { DuplicateDownloadChoice } from "../DuplicateDownloadDialog";
import {
  buildPlaylistEnqueuePlan,
  downloadJobSnapshotFromPlaylistItems,
  isPlaylistDownloaderUrl,
  playlistItemKey,
  resolveAudioOnlyForPlaylistItem,
  sumPlaylistDisplayBytes,
} from "../../playlistDownloadPlan";
import {
  canonicalYouTubeDownloaderUrl,
  extractYouTubeUrlFromText,
  playlistItemWatchUrl,
  sanitizePlaylistFolderName,
  youtubeUrlsMatch,
} from "../../youtubeUrl";
import { URL_PACER_EASE } from "./downloaderConstants";
import { sanitizeCarouselDisplayTitle } from "./downloaderFormat";
import { urlConflictsWithActiveDownloader } from "./downloaderUrlConflict";
import {
  type YoutubeUrlDropHandler,
  setYoutubeUrlDropHandler,
} from "../../features/downloader/youtubeUrlDropRegistry";
import { setDownloaderReplayHandlers } from "../../features/downloader/downloaderReplayRegistry";
import {
  commitLastDownloadBatchFromJobs,
  commitLastDownloadBatchRecord,
  devBatchToolsEnabled,
  isDevReplaySimulateActive,
} from "../../lib/devLastDownloadBatch";
import { deliverUserNotification } from "../../systemNotify";
import { ytdlpVideoFormatForMetadata } from "../../downloadFormat";

const STORAGE_FULL_NOTIFY =
  "Library storage limit reached. Free space in Settings or switch to an external download folder.";

function heroReuseEligibleJob(j: DownloadJob): boolean {
  return (
    j.status === "downloading" ||
    j.status === "paused" ||
    (j.status === "queued" &&
      (j.approval === "held" ||
        j.approval === "auto" ||
        j.approval === "pending" ||
        j.approval === "manual"))
  );
}

function jobsForHeroMetadataReuse(
  memoryJobs: readonly DownloadJob[],
): readonly DownloadJob[] {
  return memoryJobs;
}

function heroReuseJobSnapshot(
  jobs: readonly DownloadJob[],
  norm: string,
): DownloadJobMediaSnapshot | null {
  for (const j of jobs) {
    if (!youtubeUrlsMatch(j.url, norm)) continue;
    if (!heroReuseEligibleJob(j)) continue;
    if (downloadJobMediaNeedsHydration(j.metadata)) continue;
    return j.metadata ?? null;
  }
  return null;
}

function heroHasMatchingJobPendingHydration(
  jobs: readonly DownloadJob[],
  norm: string,
): boolean {
  for (const j of jobs) {
    if (!youtubeUrlsMatch(j.url, norm)) continue;
    if (!heroReuseEligibleJob(j)) continue;
    if (downloadJobMediaNeedsHydration(j.metadata)) return true;
  }
  return false;
}

function skipQueuedJobsForDuplicateHeroUrl(
  norm: string,
  skipDownloadJobAsLibraryDuplicate: (id: string) => void,
): void {
  const st = useRuforgeStore.getState();
  for (const j of st.downloadJobs) {
    if (!youtubeUrlsMatch(j.url, norm)) continue;
    if (j.status !== "queued" && j.status !== "paused") continue;
    skipDownloadJobAsLibraryDuplicate(j.id);
  }
}

export type DownloaderViewProps = {
  internalDir: string;
  storageFull: boolean;
};

export function useDownloaderView({
  internalDir,
  storageFull,
}: DownloaderViewProps) {
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const notify = useRuforgeStore((s) => s.notify);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const url = useRuforgeStore((s) => s.url);
  const setDownloaderUrl = useRuforgeStore((s) => s.setDownloaderUrl);
  const urlSourceHint = useRuforgeStore((s) => s.urlSourceHint);
  const setDownloaderUrlSourceHint = useRuforgeStore((s) => s.setDownloaderUrlSourceHint);
  const metadataLoading = useRuforgeStore((s) => s.metadataLoading);
  const setDownloaderMetadataLoading = useRuforgeStore((s) => s.setDownloaderMetadataLoading);
  const setDownloaderDuplicateDialogOpenInStore = useRuforgeStore(
    (s) => s.setDownloaderDuplicateDialogOpen,
  );
  const progress = useRuforgeStore((s) => s.progress);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const confirmPendingDownloadJob = useRuforgeStore((s) => s.confirmPendingDownloadJob);
  const setDownloaderFocusedJobId = useRuforgeStore((s) => s.setDownloaderFocusedJobId);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const queueHydrateOrphanMetadata = useRuforgeStore((s) => s.queueHydrateOrphanMetadata);
  const restoreDownloadQueueFromSessionIfEmpty = useRuforgeStore(
    (s) => s.restoreDownloadQueueFromSessionIfEmpty,
  );
  const pumpDownloadQueue = useRuforgeStore((s) => s.pumpDownloadQueue);
  const skipDownloadJobAsLibraryDuplicate = useRuforgeStore(
    (s) => s.skipDownloadJobAsLibraryDuplicate,
  );
  const libraryScanRevision = useRuforgeStore((s) => s.libraryScanRevision);
  const releaseHeldDownloadJobs = useRuforgeStore((s) => s.releaseHeldDownloadJobs);
  const resumeDownloadJob = useRuforgeStore((s) => s.resumeDownloadJob);
  const removeDownloadJob = useRuforgeStore((s) => s.removeDownloadJob);
  const setDownloadJobAudioOnly = useRuforgeStore((s) => s.setDownloadJobAudioOnly);
  const videoInfo = useRuforgeStore((s) => s.videoInfo);
  const videoInfoUrl = useRuforgeStore((s) => s.videoInfoUrl);
  const setVideoInfo = useRuforgeStore((s) => s.setVideoInfo);
  const metadataError = useRuforgeStore((s) => s.metadataError);
  const setMetadataError = useRuforgeStore((s) => s.setMetadataError);
  const isFocused = useRuforgeStore((s) => s.isFocused);
  const setDownloaderUrlFocused = useRuforgeStore((s) => s.setDownloaderUrlFocused);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const ensureLibraryEntriesLoaded = useRuforgeStore((s) => s.ensureLibraryEntriesLoaded);
  const entries = useRuforgeStore((s) => s.entries);
  const anyDownloading = useRuforgeStore((s) =>
    s.downloadJobs.some((j) => j.status === "downloading"),
  );
  const focusedJobId = useRuforgeStore((s) => s.focusedJobId);
  const focusedJob = useRuforgeStore((s) => {
    if (!s.focusedJobId) return null;
    return s.downloadJobs.find((j) => j.id === s.focusedJobId) ?? null;
  });
  const [batchQueueJobIds, setBatchQueueJobIds] = useState<string[] | null>(null);
  const [batchQueueSnapshots, setBatchQueueSnapshots] = useState<
    Record<string, { thumbnail: string; title: string }>
  >({});

  useEffect(() => {
    const held = downloadJobs
      .filter((j) => j.status === "queued" && j.approval === "held")
      .sort((a, b) => a.createdAt - b.createdAt);
    if (held.length > 1) {
      setBatchQueueJobIds(held.map((j) => j.id));
      return;
    }

    const pipeline = downloadJobs
      .filter(
        (j) =>
          j.status === "queued" || j.status === "downloading" || j.status === "paused",
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    setBatchQueueJobIds((prev) => {
      if (pipeline.length > 1) {
        const pipelineIds = new Set(pipeline.map((j) => j.id));
        if (prev && prev.length > 1) {
          const merged = prev.filter((id) => pipelineIds.has(id));
          for (const j of pipeline) {
            if (!merged.includes(j.id)) merged.push(j.id);
          }
          return merged.length > 1 ? merged : null;
        }
        return pipeline.map((j) => j.id);
      }
      // Drop batch chrome once the active pipeline is a single job (or empty).
      return null;
    });
  }, [downloadJobs]);

  const batchQueueJobs = useMemo(() => {
    const active = (ids: string[]) => {
      const jobs = downloadJobs.filter(
        (j) =>
          ids.includes(j.id) &&
          (j.status === "queued" || j.status === "downloading" || j.status === "paused"),
      );
      return ids
        .map((id) => jobs.find((j) => j.id === id))
        .filter((j): j is DownloadJob => j != null);
    };
    if (batchQueueJobIds && batchQueueJobIds.length > 1) {
      return active(batchQueueJobIds);
    }
    const held = downloadJobs.filter((j) => j.status === "queued" && j.approval === "held");
    if (held.length > 1) return held;
    return [];
  }, [downloadJobs, batchQueueJobIds]);

  const batchQueueActive = batchQueueJobs.length > 1;
  const focusShowsBigProgress = focusedJob?.status === "downloading";
  const duplicateChoiceResolverRef = useRef<((choice: DuplicateDownloadChoice) => void) | null>(null);
  const lastDupCheckLibraryScanRev = useRef<number | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [replaceDialogMatch, setReplaceDialogMatch] = useState<DuplicateMatch | null>(null);
  const storageBlocksNewDownloads = saveToInternal && storageFull;
  const [quickEnqueueHint, setQuickEnqueueHint] = useState<
    null | "empty" | "conflict" | "library_skip" | "storage_full" | "wait_metadata"
  >(null);
  /** First Download click while metadata is still loading: show feedback, start when ready. */
  const [downloadStartPending, setDownloadStartPending] = useState(false);
  const pendingDownloadUrlRef = useRef<string | null>(null);
  const downloadStartInflightRef = useRef(false);
  const [pinnedQuickEnqueueUrls, setPinnedQuickEnqueueUrls] = useState<string[]>([]);
  const [clipboardPastedHint, setClipboardPastedHint] = useState(false);
  const [clipboardOfferUrl, setClipboardOfferUrl] = useState<string | null>(null);
  const [playlistItemAudioOverrides, setPlaylistItemAudioOverrides] = useState<
    Record<string, boolean>
  >({});
  const clipboardReadGenRef = useRef(0);
  const [urlBubbleCopied, setUrlBubbleCopied] = useState(false);
  const urlBubbleCopyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ytdlpUpdateDismissed, setYtdlpUpdateDismissed] = useState(false);
  const {
    status: ytdlpUpdateStatus,
    loading: ytdlpUpdateLoading,
    updating: ytdlpUpdating,
    percent: ytdlpUpdatePercent,
    invokeError: ytdlpUpdateInvokeError,
    downloadUpdate: downloadYtdlpUpdateNow,
  } = useYtdlpUpdate();
  const showYtdlpStrip = Boolean(
    !ytdlpUpdateDismissed &&
      !ytdlpUpdateLoading &&
      ytdlpUpdateStatus &&
      (ytdlpUpdateStatus.updateAvailable || ytdlpUpdating || Boolean(ytdlpUpdateInvokeError)),
  );
  const showUrlBubble = useMemo(
    () =>
      Boolean(
        videoInfo &&
          !metadataLoading &&
          !anyDownloading &&
          url.startsWith("http") &&
          !(focusedJobId && focusedJob && !youtubeUrlsMatch(url, focusedJob.url)),
      ),
    [videoInfo, metadataLoading, anyDownloading, url, focusedJobId, focusedJob],
  );

  /** Hide URL bar / browser strip when browsing a queue row that is not the hero URL field. */
  const queueBrowsingHidesUrlChrome = useMemo(
    () =>
      Boolean(
        focusedJobId &&
          focusedJob &&
          downloadJobs.length > 0 &&
          (!url.trim() || !youtubeUrlsMatch(url, focusedJob.url)),
      ),
    [focusedJobId, focusedJob, url, downloadJobs.length],
  );

  const hasQueuedOrPausedJobs = useMemo(
    () =>
      downloadJobs.some((j) => j.status === "queued" || j.status === "paused"),
    [downloadJobs],
  );

  const batchQueuePlaylistView = useMemo(() => {
    if (batchQueueJobs.length <= 1 || anyDownloading) return null;
    const playlistItems = batchQueueJobs.map((job) => {
      const m = job.metadata;
      const rawTitle = (job.title ?? m?.title ?? "").trim();
      return {
        title: rawTitle || job.url,
        thumbnail: m?.thumbnail ?? "",
        duration: m?.duration ?? 0,
        webpageUrl: job.url,
        id: job.id,
        fileSizeBytes: m?.fileSizeBytes ?? null,
        fileSizeBytesAudio: m?.fileSizeBytesAudio ?? null,
        fileSizeBytesVideo: m?.fileSizeBytesVideo ?? null,
      };
    });
    const duration = playlistItems.reduce((sum, item) => sum + (item.duration || 0), 0);
    return {
      title: "Queued downloads",
      duration,
      fileSizeBytes: null as number | null,
      isPlaylist: true as const,
      playlistItems,
      loading: false as const,
    };
  }, [anyDownloading, batchQueueJobs]);

  useEffect(() => {
    if (!batchQueueJobIds || batchQueueJobIds.length <= 1) {
      setBatchQueueSnapshots({});
      return;
    }
    setBatchQueueSnapshots((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of batchQueueJobIds) {
        const job = downloadJobs.find((j) => j.id === id);
        if (!job) continue;
        const m = job.metadata;
        const title = (job.title ?? m?.title ?? job.url).trim();
        const thumbnail = m?.thumbnail ?? "";
        const existing = next[id];
        if (!existing || existing.thumbnail !== thumbnail || existing.title !== title) {
          next[id] = { thumbnail, title };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [batchQueueJobIds, downloadJobs]);

  const batchDownloadCarousel = useMemo(() => {
    if (!batchQueueJobIds || batchQueueJobIds.length <= 1) return null;

    const finishedCount = batchQueueJobIds.filter(
      (id) => !downloadJobs.some((j) => j.id === id),
    ).length;
    const pendingInBatch = batchQueueJobIds.some((id) => {
      const j = downloadJobs.find((x) => x.id === id);
      return (
        j &&
        (j.status === "queued" || j.status === "downloading" || j.status === "paused")
      );
    });
    if (!pendingInBatch && finishedCount === 0) return null;
    if (finishedCount >= batchQueueJobIds.length) return null;

    const items = batchQueueJobIds.map((id) => {
      const snap = batchQueueSnapshots[id];
      const job = downloadJobs.find((j) => j.id === id);
      const rawTitle = snap?.title ?? job?.metadata?.title ?? job?.title ?? "";
      const thumbnail = snap?.thumbnail ?? job?.metadata?.thumbnail ?? "";
      const safeTitle = sanitizeCarouselDisplayTitle(rawTitle);
      return {
        thumbnail,
        title: safeTitle,
        needsHydration:
          downloadJobMediaNeedsHydration(job?.metadata ?? null) ||
          !thumbnail.trim() ||
          !safeTitle,
      };
    });

    let currentIndex = batchQueueJobIds.findIndex(
      (id) => downloadJobs.find((j) => j.id === id)?.status === "downloading",
    );
    if (currentIndex < 0) {
      const queuedNext = batchQueueJobIds.findIndex((id) => {
        const j = downloadJobs.find((x) => x.id === id);
        return j && (j.status === "queued" || j.status === "paused");
      });
      currentIndex =
        queuedNext >= 0
          ? queuedNext
          : Math.min(finishedCount, batchQueueJobIds.length - 1);
    }

    return {
      items,
      currentIndex,
      totalItems: batchQueueJobIds.length,
      collectionTitle: "Queued downloads",
    };
  }, [batchQueueJobIds, batchQueueSnapshots, downloadJobs]);

  const playlistDownloadCarousel = useMemo(() => {
    if (!anyDownloading) return null;
    const playlistItems =
      videoInfo?.playlistItems ??
      (focusedJob?.metadata?.isPlaylist ? focusedJob.metadata.playlistItems : undefined);
    const isPlaylistJob =
      Boolean(videoInfo?.isPlaylist) ||
      Boolean(focusedJob?.metadata?.isPlaylist && focusedJob.status === "downloading");
    if (!isPlaylistJob || !playlistItems?.length || playlistItems.length <= 1) {
      return null;
    }
    return {
      items: playlistItems.map((item) => ({
        thumbnail: item.thumbnail,
        title: sanitizeCarouselDisplayTitle(item.title),
        needsHydration:
          !String(item.thumbnail ?? "").trim() ||
          !sanitizeCarouselDisplayTitle(item.title),
      })),
      currentIndex: typeof progress?.currentIndex === "number" ? progress.currentIndex : 0,
      totalItems:
        typeof progress?.totalItems === "number"
          ? progress.totalItems
          : playlistItems.length,
      collectionTitle: videoInfo?.title ?? focusedJob?.metadata?.title ?? "Playlist",
    };
  }, [anyDownloading, videoInfo, focusedJob, progress]);

  const collectionDownloadCarousel = batchDownloadCarousel ?? playlistDownloadCarousel;
  /** Held staging is a review queue (Download still required), not a transfer. */
  const batchIsHeldOnly =
    batchQueueJobs.length > 0 &&
    batchQueueJobs.every((j) => j.status === "queued" && j.approval === "held");
  const showImmersiveDownload =
    focusShowsBigProgress ||
    (Boolean(batchDownloadCarousel) && !batchIsHeldOnly);

  const batchQueueHeroDisplayBytes = useMemo(() => {
    if (batchQueueJobs.length <= 1) return null;
    let sum = 0;
    let any = false;
    for (const job of batchQueueJobs) {
      const m = job.metadata;
      const audio = job.options.audioOnly === true;
      const pick = audio
        ? (m?.fileSizeBytesAudio ?? m?.fileSizeBytes)
        : (m?.fileSizeBytesVideo ?? m?.fileSizeBytes);
      if (typeof pick === "number" && pick > 0) {
        sum += pick;
        any = true;
      }
    }
    return any ? sum : null;
  }, [batchQueueJobs]);

  const toggleBatchQueueJobAudio = useCallback(
    (jobId: string, audioOnly: boolean) => {
      setDownloadJobAudioOnly(jobId, audioOnly);
    },
    [setDownloadJobAudioOnly],
  );

  const isBatchQueueJobDuplicate = useCallback(
    (watchUrl: string | undefined) => {
      if (!watchUrl?.trim()) return false;
      return Boolean(findLibraryDuplicate(watchUrl, entries));
    },
    [entries],
  );

  /**
   * Top-left paperclip / pinned chips / "Queue another" — after hero metadata lands
   * (`showUrlBubble`), or when a restored queue has queued/paused rows with an empty bar.
   */
  const showQueueAddToolbar = useMemo(
    () => Boolean(!anyDownloading && (hasQueuedOrPausedJobs || showUrlBubble)),
    [anyDownloading, hasQueuedOrPausedJobs, showUrlBubble],
  );

  const showTopLeftDownloaderChrome = useMemo(
    () => Boolean(showUrlBubble || showQueueAddToolbar),
    [showUrlBubble, showQueueAddToolbar],
  );

  /** Paperclip chip only when the bar URL still matches the queue or an unstaged hero preview. */
  const showMainUrlChip = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) return false;
    if (metadataLoading) return false;
    if (downloadJobs.some((j) => youtubeUrlsMatch(j.url, trimmed))) return true;
    if (focusedJob && youtubeUrlsMatch(focusedJob.url, trimmed)) return true;
    return Boolean(
      videoInfo &&
        videoInfoUrl &&
        youtubeUrlsMatch(trimmed, videoInfoUrl),
    );
  }, [url, downloadJobs, focusedJob, videoInfo, videoInfoUrl, metadataLoading]);

  const libraryDuplicate = useMemo(() => {
    if (!url.startsWith("http")) return null;
    if (videoInfo?.isPlaylist) return null;
    return findLibraryDuplicate(url, entries);
  }, [url, entries, videoInfo?.isPlaylist]);

  const libraryDuplicateTitle = useMemo(() => {
    const file = libraryDuplicate?.file;
    if (!file) return null;
    const t =
      file.canonicalTitle?.trim() ||
      file.name?.trim() ||
      "";
    return t || null;
  }, [libraryDuplicate]);

  /** Queued/paused row tied to hero (focused job or URL bar match). */
  const heroEditableJob = useMemo(() => {
    const movable = (j: (typeof downloadJobs)[number]) =>
      j.status === "queued" || j.status === "paused";
    if (focusedJob && movable(focusedJob)) return focusedJob;
    const bar = url.trim();
    if (!bar.startsWith("http")) return null;
    return (
      downloadJobs.find((j) => movable(j) && youtubeUrlsMatch(j.url, bar)) ?? null
    );
  }, [focusedJob, downloadJobs, url]);

  const heroAudioOnly = heroEditableJob
    ? heroEditableJob.options.audioOnly === true
    : settings.downloadAudioOnly === true;

  const playlistEnqueuePlan = useMemo(() => {
    if (!videoInfo?.isPlaylist || !videoInfo.playlistItems?.length) return null;
    return buildPlaylistEnqueuePlan(
      videoInfo.playlistItems,
      entries,
      playlistItemAudioOverrides,
      heroAudioOnly,
      settings.skipDuplicatesAutomatically,
    );
  }, [
    videoInfo,
    entries,
    playlistItemAudioOverrides,
    heroAudioOnly,
    settings.skipDuplicatesAutomatically,
  ]);

  const playlistDuplicateSummary = useMemo(() => {
    if (!playlistEnqueuePlan || playlistEnqueuePlan.duplicates.length === 0) {
      return null;
    }
    const n = playlistEnqueuePlan.duplicates.length;
    const total = playlistEnqueuePlan.totalResolved;
    return `${n} of ${total} already in library`;
  }, [playlistEnqueuePlan]);

  const showDuplicateBanner =
    !batchQueueActive &&
    Boolean(libraryDuplicate) &&
    !videoInfo?.isPlaylist &&
    url.startsWith("http") &&
    !focusShowsBigProgress;
  const duplicateBannerAutoSkip = settings.skipDuplicatesAutomatically;
  const subLangsForDisplay = effectiveDownloadSubLangs(settings);
  const urlChipLayoutTransition = { layout: { duration: 0.55, ease: URL_PACER_EASE } } as const;

  const heroBackdropThumb = useMemo(() => {
    const fromJob = focusedJob?.metadata?.thumbnail?.trim();
    if (fromJob) return fromJob;
    if (!focusedJob && videoInfo?.thumbnail) return videoInfo.thumbnail.trim();
    return "";
  }, [focusedJob, videoInfo]);

  /** Keep Download clickable while metadata loads; click arms a pending start. */
  const showPrimaryDownload = useMemo(() => {
    if (focusShowsBigProgress) return false;
    if (downloadStartPending) return true;
    if (batchQueueActive && !anyDownloading) {
      return batchQueueJobs.length > 0;
    }
    if (videoInfo?.isPlaylist && playlistEnqueuePlan) {
      return playlistEnqueuePlan.toDownload.length > 0;
    }
    if (!focusedJob) {
      return url.startsWith("http");
    }
    const barTrimmed = url.trim();
    const queueRowIsDownloadTarget =
      !barTrimmed || youtubeUrlsMatch(url, focusedJob.url);
    if (queueRowIsDownloadTarget) {
      return focusedJob.status === "queued" || focusedJob.status === "paused";
    }
    return url.startsWith("http");
  }, [
    videoInfo,
    focusedJob,
    url,
    focusShowsBigProgress,
    playlistEnqueuePlan,
    batchQueueJobs,
    batchQueueActive,
    anyDownloading,
    downloadStartPending,
  ]);

  const showHeroAudioToggle = useMemo(() => {
    if (batchQueueActive) return false;
    if (focusShowsBigProgress) return false;
    if (heroEditableJob) return true;
    if (metadataLoading || downloadStartPending) return false;
    return Boolean(videoInfo && url.startsWith("http"));
  }, [
    metadataLoading,
    focusShowsBigProgress,
    heroEditableJob,
    videoInfo,
    url,
    batchQueueActive,
    downloadStartPending,
  ]);

  const clearDownloadStartPending = useCallback(() => {
    pendingDownloadUrlRef.current = null;
    setDownloadStartPending(false);
  }, []);

  const [showAudioWarning, setShowAudioWarning] = useState(false);
  const audioWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleHeroAudio = useCallback(() => {
    let becomingAudioOnly = false;
    if (heroEditableJob) {
      becomingAudioOnly = !(heroEditableJob.options.audioOnly === true);
      setDownloadJobAudioOnly(heroEditableJob.id, becomingAudioOnly);
    } else {
      becomingAudioOnly = !settingsRef.current.downloadAudioOnly;
      void updateSetting("downloadAudioOnly", becomingAudioOnly);
    }

    if (becomingAudioOnly) {
      // Trigger temporary warning chip on the URL bar icon
      setShowAudioWarning(true);
      if (audioWarningTimeoutRef.current) clearTimeout(audioWarningTimeoutRef.current);
      audioWarningTimeoutRef.current = setTimeout(() => setShowAudioWarning(false), 3000);
    } else {
      // Clear warning immediately if switching back to video
      setShowAudioWarning(false);
      if (audioWarningTimeoutRef.current) {
        clearTimeout(audioWarningTimeoutRef.current);
        audioWarningTimeoutRef.current = null;
      }
    }
  }, [heroEditableJob, setDownloadJobAudioOnly, updateSetting]);

  useEffect(() => {
    return () => {
      if (audioWarningTimeoutRef.current) clearTimeout(audioWarningTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    queueHydrateOrphanMetadata();
  }, [queueHydrateOrphanMetadata]);

  useEffect(() => {
    setPinnedQuickEnqueueUrls((prev) =>
      prev.filter((u) => downloadJobs.some((j) => youtubeUrlsMatch(j.url, u))),
    );
  }, [downloadJobs]);

  useEffect(() => {
    const resolve = duplicateChoiceResolverRef.current;
    if (resolve) {
      duplicateChoiceResolverRef.current = null;
      resolve("cancel");
    }
    setReplaceDialogOpen(false);
    setReplaceDialogMatch(null);
  }, [url]);

  useEffect(() => {
    if (!quickEnqueueHint) return;
    const t = setTimeout(() => setQuickEnqueueHint(null), 2600);
    return () => clearTimeout(t);
  }, [quickEnqueueHint]);

  useEffect(() => {
    if (!url.startsWith("http")) return;
    // Scan on paste/URL entry so the soft duplicate warning can appear before Download.
    void ensureLibraryEntriesLoaded();
  }, [url, ensureLibraryEntriesLoaded]);

  /** Rows enqueued before library scan caught up — skip before yt-dlp starts (not after cancel). */
  useEffect(() => {
    if (!settings.skipDuplicatesAutomatically) return;
    const st = useRuforgeStore.getState();
    for (const j of st.downloadJobs) {
      if (j.approval === "manual") continue;
      if (j.status === "queued" || j.status === "paused") {
        if (!findLibraryDuplicate(j.url, st.entries)) continue;
        skipDownloadJobAsLibraryDuplicate(j.id);
        continue;
      }
      if (j.status === "downloading" && !jobHasDownloadTransferStarted(j)) {
        if (!findLibraryDuplicate(j.url, st.entries)) continue;
        skipDownloadJobAsLibraryDuplicate(j.id);
      }
    }
  }, [
    entries,
    libraryScanRevision,
    settings.skipDuplicatesAutomatically,
    skipDownloadJobAsLibraryDuplicate,
  ]);

  const handleBrowserChange = async (val: string) => {
    updateSetting("browserContext", val);
    if (val === "custom") {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (selected && typeof selected === "string") {
        updateSetting("cookieFile", selected);
      } else {
        updateSetting("browserContext", "");
      }
    }
  };

  const dismissYtdlpUpdateBanner = useCallback(() => {
    setYtdlpUpdateDismissed(true);
  }, []);

  const enqueueDownloadOnly = useCallback(
    (
      targetUrl: string,
      choice: Exclude<DuplicateDownloadChoice, "cancel"> = "replace",
      meta?: PlaylistBatchEnqueueMeta & {
        approval?: "auto" | "pending" | "held";
      },
      audioOnly?: boolean,
    ) => {
      const s = settingsRef.current;
      if (!targetUrl || storageBlocksNewDownloads) return "";
      const outputPath = saveToInternal ? internalDir : outputDir;
      let options = buildDownloadJobOptions(s, outputPath, choice);
      if (audioOnly !== undefined) {
        options = patchDownloadJobOptionsForAudio(options, audioOnly, s);
      }
      if (meta?.playlistOutputFolder) {
        options = {
          ...options,
          playlistOutputFolder: meta.playlistOutputFolder,
          playlistIndex: meta.playlistIndex ?? null,
        };
      }
      const st = useRuforgeStore.getState();
      let snapshot =
        youtubeUrlsMatch(targetUrl, st.url) && st.videoInfo
          ? videoInfoToDownloadJobSnapshot(st.videoInfo, options.audioOnly)
          : undefined;
      if (!snapshot && st.videoInfo?.playlistItems?.length) {
        snapshot =
          downloadJobSnapshotFromPlaylistItems(
            targetUrl,
            st.videoInfo.playlistItems,
            options.audioOnly,
          ) ?? undefined;
      }
      const batchTitle = meta?.title?.trim();
      if (!snapshot && batchTitle) {
        snapshot = {
          title: batchTitle,
          thumbnail: "",
          duration: 0,
          isPlaylist: false,
        };
      }
      const approval = meta?.approval ?? "auto";
      return enqueueDownload(targetUrl, options, {
        snapshot,
        title: meta?.title,
        approval,
        enqueueSource: meta?.enqueueSource,
        ...(isDevReplaySimulateActive() ? { devSimulateDownload: true } : {}),
      });
    },
    [storageBlocksNewDownloads, outputDir, internalDir, enqueueDownload],
  );

  /** Turn the hero URL bar into a queued job when adding another URL, so the first link is not lost. */
  const promoteStagedBarToDownloadQueue = useCallback(async () => {
    const st = useRuforgeStore.getState();
    const staged = st.url.trim();
    if (!staged.startsWith("http")) return;
    if (st.downloadJobs.some((j) => youtubeUrlsMatch(j.url, staged))) return;
    if (!st.videoInfo || st.metadataLoading) {
      setQuickEnqueueHint("wait_metadata");
      return;
    }
    const duplicate = findLibraryDuplicate(staged, st.entries);
    if (duplicate) {
      if (settingsRef.current.skipDuplicatesAutomatically) return;
      const choice = await new Promise<DuplicateDownloadChoice>((resolve) => {
        duplicateChoiceResolverRef.current = resolve;
        setReplaceDialogMatch(duplicate);
        setReplaceDialogOpen(true);
      });
      if (choice === "cancel") return;
      const replaced = await applyReplaceBeforeDownload(staged, choice);
      if (!replaced.ok) {
        notify(replaced.reason, "warning");
        return;
      }
      enqueueDownloadOnly(staged, choice, {
        approval: "held",
        enqueueSource: "heroUrlStaging",
      });
      return;
    }
    enqueueDownloadOnly(staged, "replace", {
      approval: "held",
      enqueueSource: "heroUrlStaging",
    });
  }, [enqueueDownloadOnly, setQuickEnqueueHint, notify]);

  const resolveHeroAudioOnly = useCallback(() => {
    const st = useRuforgeStore.getState();
    const bar = st.url.trim();
    const focused = st.focusedJobId
      ? st.downloadJobs.find((j) => j.id === st.focusedJobId)
      : null;
    const movable = (j: (typeof st.downloadJobs)[number]) =>
      j.status === "queued" || j.status === "paused";
    const row =
      focused && movable(focused)
        ? focused
        : bar.startsWith("http")
          ? st.downloadJobs.find((j) => movable(j) && youtubeUrlsMatch(j.url, bar))
          : null;
    if (row) return row.options.audioOnly === true;
    return settingsRef.current.downloadAudioOnly === true;
  }, []);

  const startDownloadForUrl = useCallback(
    async (
      targetUrl: string,
      choice: Exclude<DuplicateDownloadChoice, "cancel"> = "replace",
      meta?: {
        title?: string;
        audioOnly?: boolean;
        playlistOutputFolder?: string;
        playlistIndex?: number;
        enqueueSource?: DownloadEnqueueSource;
        skipBatchCapture?: boolean;
      },
    ) => {
      const replaced = await applyReplaceBeforeDownload(targetUrl, choice);
      if (!replaced.ok) {
        notify(replaced.reason, "warning");
        return;
      }
      const audioOnly = meta?.audioOnly ?? resolveHeroAudioOnly();
      const stEnqueue = useRuforgeStore.getState();
      const enqueueSource =
        meta?.enqueueSource ??
        (meta?.playlistOutputFolder != null
          ? "heroPlaylistDownload"
          : stEnqueue.urlSourceHint === "clipboard"
            ? "heroClipboardPaste"
            : "heroSingleDownload");
      const jobId = enqueueDownloadOnly(
        targetUrl,
        choice,
        {
          title: meta?.title,
          approval: "auto",
          playlistOutputFolder: meta?.playlistOutputFolder,
          playlistIndex: meta?.playlistIndex,
          enqueueSource,
        },
        audioOnly,
      );
      if (!jobId) return;
      const heldCount = stEnqueue.downloadJobs.filter(
        (j) => j.status === "queued" && j.approval === "held",
      ).length;
      if (heldCount === 0 && devBatchToolsEnabled() && !meta?.skipBatchCapture) {
        const job = useRuforgeStore.getState().downloadJobs.find((j) => j.id === jobId);
        if (job) {
          commitLastDownloadBatchFromJobs([job], {
            heroUrl: stEnqueue.url,
            heroVideoInfo:
              stEnqueue.videoInfo != null
                ? videoInfoToDownloadJobSnapshot(stEnqueue.videoInfo, audioOnly)
                : null,
          });
        }
      }
      releaseHeldDownloadJobs();
      const job = useRuforgeStore.getState().downloadJobs.find((j) => j.id === jobId);
      if (job?.status === "paused") {
        await resumeDownloadJob(jobId);
      } else {
        pumpDownloadQueue();
      }
    },
    [
      enqueueDownloadOnly,
      releaseHeldDownloadJobs,
      resumeDownloadJob,
      pumpDownloadQueue,
      resolveHeroAudioOnly,
      notify,
    ],
  );

  const promptDuplicateChoice = useCallback((match: DuplicateMatch) => {
    return new Promise<DuplicateDownloadChoice>((resolve) => {
      duplicateChoiceResolverRef.current = resolve;
      setReplaceDialogMatch(match);
      setReplaceDialogOpen(true);
    });
  }, []);

  const resolveDuplicate = useCallback(
    async (targetUrl: string): Promise<DuplicateMatch | null> => {
      const list = useRuforgeStore.getState().entries;
      if (list.length === 0) {
        // Never block Download on a cold gallery scan; auto-skip still runs in
        // startHydratedDownloadJob after the job is visibly promoted.
        void fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true });
        return null;
      }
      return findLibraryDuplicate(targetUrl, list);
    },
    [fetchEntries],
  );

  const executeDownloadStart = useCallback(async () => {
    if (downloadStartInflightRef.current) return;
    downloadStartInflightRef.current = true;
    try {
    const st0 = useRuforgeStore.getState();
    const barUrl = st0.url.trim();
    const focused = st0.focusedJobId
      ? st0.downloadJobs.find((j) => j.id === st0.focusedJobId)
      : null;
    const effectiveUrl = barUrl || focused?.url?.trim() || "";
    if (!effectiveUrl) return;

    const vi = st0.videoInfo;
    const playlistItems = vi?.isPlaylist ? vi.playlistItems : undefined;

    if (playlistItems && playlistItems.length > 0) {
      const plan = buildPlaylistEnqueuePlan(
        playlistItems,
        st0.entries,
        playlistItemAudioOverrides,
        resolveHeroAudioOnly(),
        settingsRef.current.skipDuplicatesAutomatically,
      );

      if (plan.toDownload.length === 0) {
        if (plan.duplicates.length > 0) {
          notify(
            settingsRef.current.skipDuplicatesAutomatically
              ? "All videos in this playlist are already in your library."
              : "No new videos to download. Resolve duplicates in library first.",
            "info",
          );
        } else {
          notify("No downloadable videos found in this playlist.", "warning");
        }
        return;
      }

      const folder = sanitizePlaylistFolderName(vi?.title ?? "playlist");
      if (devBatchToolsEnabled() && vi) {
        commitLastDownloadBatchRecord({
          batchKind: "playlist",
          heroUrl: barUrl || effectiveUrl,
          heroVideoInfo: videoInfoToDownloadJobSnapshot(vi, resolveHeroAudioOnly()),
          playlistItemAudioOverrides,
          items: plan.toDownload.map((item) => ({
            url: item.url,
            source: "heroPlaylistDownload",
            approval: "auto",
            snapshot:
              downloadJobSnapshotFromPlaylistItems(
                item.url,
                vi.playlistItems ?? [],
                item.audioOnly,
              ) ?? null,
            options: {
              playlistOutputFolder: folder,
              playlistIndex: item.index,
              audioOnly: item.audioOnly,
            },
          })),
        });
      }
      let batchChoice: Exclude<DuplicateDownloadChoice, "cancel"> | null = null;
      let started = 0;
      const skipped = settingsRef.current.skipDuplicatesAutomatically
        ? plan.duplicates.length
        : 0;

      for (const item of plan.toDownload) {
        const duplicate = await resolveDuplicate(item.url);
        if (duplicate && !settingsRef.current.skipDuplicatesAutomatically) {
          if (batchChoice === null) {
            const choice = await promptDuplicateChoice(duplicate);
            if (choice === "cancel") return;
            batchChoice = choice;
          }
        } else if (duplicate) {
          continue;
        }

        await startDownloadForUrl(item.url, batchChoice ?? "replace", {
          title: item.title,
          audioOnly: item.audioOnly,
          playlistOutputFolder: folder,
          playlistIndex: item.index,
          enqueueSource: "heroPlaylistDownload",
          skipBatchCapture: true,
        });
        started += 1;
      }

      if (skipped > 0 && started > 0) {
        notify(
          `Skipped ${skipped} duplicate(s), started ${started} download(s).`,
          "info",
        );
      } else if (skipped > 0 && started === 0) {
        notify("All videos in this playlist are already in your library.", "info");
      }
      return;
    }

    const duplicate =
      (barUrl && libraryDuplicate && youtubeUrlsMatch(barUrl, effectiveUrl)
        ? libraryDuplicate
        : null) ?? (await resolveDuplicate(effectiveUrl));
    if (!duplicate) {
      await startDownloadForUrl(effectiveUrl);
      return;
    }
    if (settingsRef.current.skipDuplicatesAutomatically) {
      notify("This video is already in your library.", "info");
      return;
    }

    const choice = await promptDuplicateChoice(duplicate);
    if (choice === "cancel") return;
    await startDownloadForUrl(effectiveUrl, choice);
    } finally {
      downloadStartInflightRef.current = false;
      const pending = pendingDownloadUrlRef.current;
      if (pending) {
        const armed = useRuforgeStore.getState().downloadJobs.some(
          (j) =>
            youtubeUrlsMatch(j.url, pending) &&
            (j.status === "downloading" ||
              j.status === "paused" ||
              (j.status === "queued" && j.approval === "auto")),
        );
        if (!armed) {
          pendingDownloadUrlRef.current = null;
          setDownloadStartPending(false);
        }
      }
    }
  }, [
    libraryDuplicate,
    resolveDuplicate,
    startDownloadForUrl,
    notify,
    promptDuplicateChoice,
    playlistItemAudioOverrides,
    resolveHeroAudioOnly,
  ]);

  const handleDownloadClick = useCallback(async () => {
    if (storageBlocksNewDownloads) {
      void deliverUserNotification(
        { dedupeKey: "storage-full", body: STORAGE_FULL_NOTIFY, kind: "warning" },
        notify,
      );
      return;
    }

    const st0 = useRuforgeStore.getState();
    const barUrl = st0.url.trim();
    const focused = st0.focusedJobId
      ? st0.downloadJobs.find((j) => j.id === st0.focusedJobId)
      : null;
    const effectiveUrlEarly = barUrl || focused?.url?.trim() || "";

    // Spam clicks while a start is already armed: acknowledge once, ignore the rest.
    if (
      downloadStartPending &&
      pendingDownloadUrlRef.current &&
      effectiveUrlEarly &&
      youtubeUrlsMatch(pendingDownloadUrlRef.current, effectiveUrlEarly)
    ) {
      return;
    }

    const heldBatch = st0.downloadJobs.filter(
      (j) => j.status === "queued" && j.approval === "held",
    );
    const barMatchesHeld =
      heldBatch.length > 0 &&
      (!barUrl || heldBatch.some((j) => youtubeUrlsMatch(j.url, barUrl)));

    if (heldBatch.length > 1 && barMatchesHeld) {
      const ordered = [...heldBatch].sort((a, b) => a.createdAt - b.createdAt);
      const toStart: string[] = [];
      for (const job of ordered) {
        const duplicate = await resolveDuplicate(job.url);
        if (!duplicate) {
          toStart.push(job.id);
          continue;
        }
        if (settingsRef.current.skipDuplicatesAutomatically) {
          skipDownloadJobAsLibraryDuplicate(job.id);
          continue;
        }
        const choice = await promptDuplicateChoice(duplicate);
        if (choice === "cancel") continue;
        const replaced = await applyReplaceBeforeDownload(job.url, choice);
        if (!replaced.ok) {
          notify(replaced.reason, "warning");
          continue;
        }
        toStart.push(job.id);
      }
      if (toStart.length === 0) {
        pendingDownloadUrlRef.current = null;
        setDownloadStartPending(false);
        return;
      }
      const firstId = toStart[0]!;
      const first =
        useRuforgeStore.getState().downloadJobs.find((j) => j.id === firstId) ??
        ordered.find((j) => j.id === firstId)!;
      pendingDownloadUrlRef.current = first.url;
      setDownloadStartPending(true);
      releaseHeldDownloadJobs();
      setDownloaderFocusedJobId(first.id);
      setDownloaderUrl(first.url);
      setDownloaderUrlSourceHint("explorer");
      pumpDownloadQueue();
      return;
    }

    const effectiveUrl = effectiveUrlEarly;
    if (!effectiveUrl) return;

    // Immediate feedback before any await (duplicate scan used to hang here silently).
    pendingDownloadUrlRef.current = effectiveUrl;
    setDownloadStartPending(true);

    const heroInfoUrl = st0.videoInfoUrl;
    const heroReady =
      Boolean(st0.videoInfo) &&
      Boolean(heroInfoUrl) &&
      heroInfoUrl != null &&
      youtubeUrlsMatch(heroInfoUrl, effectiveUrl) &&
      !st0.metadataLoading;

    if (!heroReady) {
      return;
    }

    await executeDownloadStart();
  }, [
    storageBlocksNewDownloads,
    notify,
    releaseHeldDownloadJobs,
    pumpDownloadQueue,
    setDownloaderFocusedJobId,
    setDownloaderUrl,
    setDownloaderUrlSourceHint,
    downloadStartPending,
    executeDownloadStart,
    resolveDuplicate,
    promptDuplicateChoice,
    skipDownloadJobAsLibraryDuplicate,
  ]);

  useEffect(() => {
    const pending = pendingDownloadUrlRef.current;
    if (!downloadStartPending || !pending) return;
    if (url.trim() && !youtubeUrlsMatch(url, pending)) {
      clearDownloadStartPending();
    }
  }, [url, downloadStartPending, clearDownloadStartPending]);

  useEffect(() => {
    if (!downloadStartPending) return;
    const pending = pendingDownloadUrlRef.current;
    if (!pending) {
      clearDownloadStartPending();
      return;
    }
    if (url.trim() && !youtubeUrlsMatch(url, pending)) return;

    const existing = downloadJobs.find(
      (j) =>
        youtubeUrlsMatch(j.url, pending) &&
        (j.status === "queued" || j.status === "paused" || j.status === "downloading"),
    );
    if (existing?.status === "downloading") {
      clearDownloadStartPending();
      return;
    }
    if (existing && existing.approval === "held") {
      releaseHeldDownloadJobs();
      pumpDownloadQueue();
      return;
    }
    if (existing && (existing.approval === "auto" || existing.status === "paused")) {
      // Click already armed this URL; keep Starting… until promote.
      return;
    }

    if (metadataLoading) return;

    const st = useRuforgeStore.getState();
    const heroInfoUrl = st.videoInfoUrl;
    const heroReady =
      Boolean(st.videoInfo) &&
      Boolean(heroInfoUrl) &&
      heroInfoUrl != null &&
      youtubeUrlsMatch(heroInfoUrl, pending);

    if (heroReady) {
      if (downloadStartInflightRef.current) return;
      void executeDownloadStart();
      return;
    }

    // Inspect finished without hero info (error or empty). Start thin; job hydrate fills the rest.
    if (downloadStartInflightRef.current) return;
    clearDownloadStartPending();
    void startDownloadForUrl(pending);
  }, [
    downloadStartPending,
    metadataLoading,
    videoInfo,
    videoInfoUrl,
    url,
    downloadJobs,
    clearDownloadStartPending,
    executeDownloadStart,
    startDownloadForUrl,
    pumpDownloadQueue,
    releaseHeldDownloadJobs,
  ]);

  const insertPinnedQuickEnqueueUrl = useCallback((targetUrl: string) => {
    const canon = canonicalYouTubeDownloaderUrl(targetUrl) ?? targetUrl.trim();
    setPinnedQuickEnqueueUrls((prev) => {
      if (prev.some((x) => youtubeUrlsMatch(x, canon))) return prev;
      return [canon, ...prev];
    });
  }, []);

  const removePinnedQuickEnqueueUrl = useCallback((targetUrl: string) => {
    setPinnedQuickEnqueueUrls((prev) => prev.filter((x) => !youtubeUrlsMatch(x, targetUrl)));
  }, []);

  const copyUrlToClipboard = useCallback(async (targetUrl: string) => {
    try {
      await writeText(targetUrl);
    } catch {
      try {
        await navigator.clipboard.writeText(targetUrl);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleDuplicateChoice = useCallback((choice: DuplicateDownloadChoice) => {
    const resolve = duplicateChoiceResolverRef.current;
    duplicateChoiceResolverRef.current = null;
    setReplaceDialogOpen(false);
    setReplaceDialogMatch(null);
    if (resolve) {
      resolve(choice);
    }
  }, []);

  /** App.tsx opens the downloader overlay before invoking (main-webview intake). */
  const handleDroppedYoutubeUrls = useCallback(
    async (urls: readonly string[]) => {
      if (urls.length === 0) return;
      if (storageBlocksNewDownloads) {
        void deliverUserNotification(
          { dedupeKey: "storage-full", body: STORAGE_FULL_NOTIFY, kind: "warning" },
          notify,
        );
        return;
      }

      const st = useRuforgeStore.getState();
      const mainEmpty = !st.url.trim();

      const enqueueViaQuickPath = async (videoUrl: string) => {
        if (storageBlocksNewDownloads) return;

        const s2 = useRuforgeStore.getState();
        if (urlConflictsWithActiveDownloader(videoUrl, s2.url, s2.downloadJobs)) {
          setQuickEnqueueHint("conflict");
          return;
        }

        const duplicate = await resolveDuplicate(videoUrl);
        const approval = s2.downloadJobs.some((j) => j.status === "downloading")
          ? ("pending" as const)
          : ("held" as const);

        if (!duplicate) {
          enqueueDownloadOnly(videoUrl, "replace", {
            approval,
            enqueueSource: "urlDrop",
          });
          insertPinnedQuickEnqueueUrl(videoUrl);
          return;
        }
        if (settingsRef.current.skipDuplicatesAutomatically) {
          setQuickEnqueueHint("library_skip");
          return;
        }

        const choice = await promptDuplicateChoice(duplicate);
        if (choice === "cancel") return;

        const replaced = await applyReplaceBeforeDownload(videoUrl, choice);
        if (!replaced.ok) {
          notify(replaced.reason, "warning");
          return;
        }
        enqueueDownloadOnly(videoUrl, choice, {
          approval,
          enqueueSource: "urlDrop",
        });
        insertPinnedQuickEnqueueUrl(videoUrl);
      };

      if (!mainEmpty) {
        await promoteStagedBarToDownloadQueue();
      }

      if (mainEmpty) {
        const [first, ...rest] = urls as string[];
        setDownloaderUrl(first);
        for (const u of rest) {
          await enqueueViaQuickPath(u);
        }
      } else {
        for (const u of urls) {
          await enqueueViaQuickPath(u);
        }
      }
    },
    [
      storageBlocksNewDownloads,
      notify,
      setDownloaderUrl,
      resolveDuplicate,
      enqueueDownloadOnly,
      promptDuplicateChoice,
      insertPinnedQuickEnqueueUrl,
      promoteStagedBarToDownloadQueue,
    ],
  );

  useEffect(() => {
    const run: YoutubeUrlDropHandler = (urls) => {
      void handleDroppedYoutubeUrls(urls);
    };
    setYoutubeUrlDropHandler(run);
    return () => {
      setYoutubeUrlDropHandler(null);
    };
  }, [handleDroppedYoutubeUrls]);

  useEffect(() => {
    setDownloaderDuplicateDialogOpenInStore(replaceDialogOpen);
    return () => {
      setDownloaderDuplicateDialogOpenInStore(false);
    };
  }, [replaceDialogOpen, setDownloaderDuplicateDialogOpenInStore]);

  const handleQuickEnqueueFromClipboard = useCallback(async (injectedUrl?: string) => {
    if (storageBlocksNewDownloads) {
      setQuickEnqueueHint("storage_full");
      return;
    }

    const clipUrl = injectedUrl ?? (await readClipboardYouTubeUrl());
    if (!clipUrl) {
      setQuickEnqueueHint("empty");
      return;
    }
    const st = useRuforgeStore.getState();
    if (urlConflictsWithActiveDownloader(clipUrl, st.url, st.downloadJobs)) {
      setQuickEnqueueHint("conflict");
      return;
    }

    await promoteStagedBarToDownloadQueue();

    const duplicate = await resolveDuplicate(clipUrl);
    const st0 = useRuforgeStore.getState();
    const approval = st0.downloadJobs.some((j) => j.status === "downloading")
      ? ("pending" as const)
      : ("held" as const);

    if (!duplicate) {
      enqueueDownloadOnly(clipUrl, "replace", {
        approval,
        enqueueSource: "quickEnqueueClipboard",
      });
      insertPinnedQuickEnqueueUrl(clipUrl);
      setQuickEnqueueHint(null);
      return;
    }
    if (settingsRef.current.skipDuplicatesAutomatically) {
      setQuickEnqueueHint("library_skip");
      return;
    }

    const choice = await promptDuplicateChoice(duplicate);
    if (choice === "cancel") return;
    const replaced = await applyReplaceBeforeDownload(clipUrl, choice);
    if (!replaced.ok) {
      notify(replaced.reason, "warning");
      return;
    }
    enqueueDownloadOnly(clipUrl, choice, {
      approval,
      enqueueSource: "quickEnqueueClipboard",
    });
    insertPinnedQuickEnqueueUrl(clipUrl);
    setQuickEnqueueHint(null);
  }, [
    storageBlocksNewDownloads,
    resolveDuplicate,
    enqueueDownloadOnly,
    notify,
    promptDuplicateChoice,
    insertPinnedQuickEnqueueUrl,
    promoteStagedBarToDownloadQueue,
  ]);

  const applyClipboardYoutubeUrl = useCallback(
    (clipUrl: string) => {
      const currentUrl = useRuforgeStore.getState().url;
      if (youtubeUrlsMatch(currentUrl, clipUrl)) return;
      if (!currentUrl.trim()) {
        setVideoInfo(null);
        setMetadataError(null);
        setDownloaderMetadataLoading(true);
        setDownloaderUrl(clipUrl);
        setDownloaderUrlSourceHint("clipboard");
        setPlaylistItemAudioOverrides({});
        setClipboardPastedHint(true);
        setClipboardOfferUrl(null);
        return;
      }
      setClipboardOfferUrl(clipUrl);
    },
    [
      setDownloaderUrl,
      setDownloaderUrlSourceHint,
      setVideoInfo,
      setMetadataError,
      setDownloaderMetadataLoading,
    ],
  );

  const readClipboardIntoUrl = useCallback(() => {
    const gen = ++clipboardReadGenRef.current;
    void (async () => {
      const clipUrl = await readClipboardYouTubeUrl();
      if (gen !== clipboardReadGenRef.current) return;
      if (!clipUrl) return;
      applyClipboardYoutubeUrl(clipUrl);
    })();
  }, [applyClipboardYoutubeUrl]);

  const handleUrlFocus = useCallback(() => {
    setDownloaderUrlFocused(true);
    readClipboardIntoUrl();
  }, [setDownloaderUrlFocused, readClipboardIntoUrl]);

  const handleUrlClick = useCallback(() => {
    readClipboardIntoUrl();
  }, [readClipboardIntoUrl]);

  const handleUrlClipPaste = useCallback(() => {
    readClipboardIntoUrl();
  }, [readClipboardIntoUrl]);

  const handleUrlPaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      const extracted = extractYouTubeUrlFromText(text);
      if (!extracted) return;
      e.preventDefault();
      const prev = useRuforgeStore.getState().url.trim();
      if (!youtubeUrlsMatch(prev, extracted)) {
        setVideoInfo(null);
        setMetadataError(null);
        setDownloaderMetadataLoading(true);
      }
      setDownloaderUrl(extracted);
      setDownloaderUrlSourceHint("clipboard");
      setPlaylistItemAudioOverrides({});
      setClipboardPastedHint(true);
      setClipboardOfferUrl(null);
    },
    [
      setDownloaderUrl,
      setDownloaderUrlSourceHint,
      setVideoInfo,
      setMetadataError,
      setDownloaderMetadataLoading,
    ],
  );

  const handleUrlBlur = useCallback(() => {
    clipboardReadGenRef.current += 1;
    setDownloaderUrlFocused(false);
    setClipboardOfferUrl(null);
  }, [setDownloaderUrlFocused]);

  const applyClipboardOffer = useCallback(() => {
    if (!clipboardOfferUrl) return;
    const prev = useRuforgeStore.getState().url.trim();
    if (!youtubeUrlsMatch(prev, clipboardOfferUrl)) {
      setVideoInfo(null);
      setMetadataError(null);
      setDownloaderMetadataLoading(true);
    }
    setDownloaderUrl(clipboardOfferUrl);
    setDownloaderUrlSourceHint("clipboard");
    setPlaylistItemAudioOverrides({});
    setClipboardPastedHint(true);
    setClipboardOfferUrl(null);
  }, [
    clipboardOfferUrl,
    setDownloaderUrl,
    setDownloaderUrlSourceHint,
    setVideoInfo,
    setMetadataError,
    setDownloaderMetadataLoading,
  ]);

  const togglePlaylistItemAudio = useCallback((itemKey: string, audioOnly: boolean) => {
    setPlaylistItemAudioOverrides((prev) => ({ ...prev, [itemKey]: audioOnly }));
  }, []);

  const playlistHeroDisplayBytes = useMemo(() => {
    if (!videoInfo?.isPlaylist || !videoInfo.playlistItems?.length) return null;
    return sumPlaylistDisplayBytes(
      videoInfo.playlistItems,
      playlistItemAudioOverrides,
      heroAudioOnly,
    );
  }, [videoInfo, playlistItemAudioOverrides, heroAudioOnly]);

  const isPlaylistItemDuplicate = useCallback(
    (item: { id?: string; webpageUrl?: string }) => {
      const watch = playlistItemWatchUrl(item);
      if (!watch) return false;
      return Boolean(findLibraryDuplicate(watch, entries));
    },
    [entries],
  );

  const clearUrlBubbleCopied = useCallback(() => {
    setUrlBubbleCopied(false);
    if (urlBubbleCopyResetRef.current) {
      clearTimeout(urlBubbleCopyResetRef.current);
      urlBubbleCopyResetRef.current = null;
    }
  }, []);

  const handleUrlClipCopy = useCallback(async () => {
    if (!url) return;
    try {
      await writeText(url);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        return;
      }
    }
    setUrlBubbleCopied(true);
    if (urlBubbleCopyResetRef.current) clearTimeout(urlBubbleCopyResetRef.current);
    urlBubbleCopyResetRef.current = setTimeout(() => {
      setUrlBubbleCopied(false);
      urlBubbleCopyResetRef.current = null;
    }, 2000);
  }, [url]);

  const handleClearUrl = useCallback(() => {
    clipboardReadGenRef.current += 1;
    setDownloaderUrl("");
    setDownloaderFocusedJobId(null);
    setVideoInfo(null);
    setMetadataError(null);
    setDownloaderMetadataLoading(false);
    setDownloaderUrlSourceHint(null);
    setClipboardPastedHint(false);
    setClipboardOfferUrl(null);
    setPlaylistItemAudioOverrides({});
    clearUrlBubbleCopied();
    setQuickEnqueueHint(null);
    setPinnedQuickEnqueueUrls([]);
    pendingDownloadUrlRef.current = null;
    setDownloadStartPending(false);
    downloadStartInflightRef.current = false;
    // Clear stages the whole held review queue, not only the bar URL match.
    for (const job of useRuforgeStore.getState().downloadJobs) {
      if (job.status === "queued" && job.approval === "held") {
        void removeDownloadJob(job.id);
      }
    }
    setBatchQueueJobIds(null);
    setBatchQueueSnapshots({});
  }, [
    setDownloaderUrl,
    setDownloaderFocusedJobId,
    setVideoInfo,
    setMetadataError,
    setDownloaderMetadataLoading,
    setDownloaderUrlSourceHint,
    clearUrlBubbleCopied,
    removeDownloadJob,
  ]);

  const handleStopActiveDownload = useCallback(() => {
    pendingDownloadUrlRef.current = null;
    setDownloadStartPending(false);
    downloadStartInflightRef.current = false;
    const st = useRuforgeStore.getState();
    const active = st.downloadJobs.filter(
      (j) =>
        j.status === "queued" ||
        j.status === "downloading" ||
        j.status === "paused",
    );
    const batchIds =
      batchQueueJobIds && batchQueueJobIds.length > 1 ? batchQueueJobIds : null;
    const focused = st.focusedJobId
      ? active.find((j) => j.id === st.focusedJobId)
      : null;
    const targets = batchIds
      ? active.filter((j) => batchIds.includes(j.id))
      : focused
        ? [focused]
        : active.filter((j) => j.status === "downloading").length > 0
          ? active.filter((j) => j.status === "downloading")
          : active;
    setBatchQueueJobIds(null);
    setBatchQueueSnapshots({});
    for (const job of targets) {
      void removeDownloadJob(job.id, { manual: true });
    }
  }, [batchQueueJobIds, removeDownloadJob]);

  useEffect(() => {
    if (!showUrlBubble) clearUrlBubbleCopied();
  }, [showUrlBubble, clearUrlBubbleCopied]);

  const handleUrlChange = useCallback(
    (value: string) => {
      const incoming = value.trim();
      const st0 = useRuforgeStore.getState();
      const prev = st0.url.trim();
      const urlSwitched =
        incoming.startsWith("http") &&
        (!prev.startsWith("http") || !youtubeUrlsMatch(prev, incoming));
      if (
        prev.startsWith("http") &&
        incoming.startsWith("http") &&
        !youtubeUrlsMatch(prev, incoming)
      ) {
        const alreadyQueued = st0.downloadJobs.some((j) => youtubeUrlsMatch(j.url, prev));
        const dupLib = findLibraryDuplicate(prev, st0.entries);
        const skipDup = dupLib && settingsRef.current.skipDuplicatesAutomatically;
        if (!alreadyQueued && !skipDup && st0.videoInfo && !st0.metadataLoading) {
          if (storageBlocksNewDownloads) {
            void deliverUserNotification(
              { dedupeKey: "storage-full", body: STORAGE_FULL_NOTIFY, kind: "warning" },
              notify,
            );
          } else {
            enqueueDownloadOnly(prev, "replace", {
              approval: "held",
              enqueueSource: "heroUrlStaging",
            });
          }
        }
      }
      if (urlSwitched) {
        setVideoInfo(null);
        setMetadataError(null);
        setDownloaderMetadataLoading(true);
      } else if (!incoming.startsWith("http")) {
        setVideoInfo(null);
        setMetadataError(null);
        setDownloaderMetadataLoading(false);
      }
      setDownloaderUrl(value);
      setDownloaderUrlSourceHint(null);
      setClipboardPastedHint(false);
      setClipboardOfferUrl(null);
      if (
        !incoming.startsWith("http") ||
        (prev.startsWith("http") && !youtubeUrlsMatch(prev, incoming))
      ) {
        setPlaylistItemAudioOverrides({});
      }
    },
    [
      setDownloaderUrl,
      setDownloaderUrlSourceHint,
      setVideoInfo,
      setMetadataError,
      setDownloaderMetadataLoading,
      enqueueDownloadOnly,
      storageBlocksNewDownloads,
      notify,
    ],
  );

  const replayExplorerAdd = useCallback(
    async (targetUrl: string) => {
      const s = settingsRef.current;
      const outputPath = saveToInternal ? internalDir : outputDir;
      const duplicate = await resolveDuplicate(targetUrl);
      if (duplicate) {
        if (s.skipDuplicatesAutomatically) {
          notify(
            "Already in library (skipped). Turn off Skip duplicates to choose.",
            "info",
          );
          return;
        }
        const choice = await promptDuplicateChoice(duplicate);
        if (choice === "cancel") return;
        const replaced = await applyReplaceBeforeDownload(targetUrl, choice);
        if (!replaced.ok) {
          notify(replaced.reason, "warning");
          return;
        }
        const options = buildDownloadJobOptions(s, outputPath, choice);
        enqueueDownload(targetUrl, options, {
          approval: "held",
          mirrorHeroUrl: true,
          heroUrlSourceHint: "explorer",
          enqueueSource: "explorerAdd",
          ...(isDevReplaySimulateActive() ? { devSimulateDownload: true } : {}),
        });
        return;
      }
      const options = buildDownloadJobOptions(s, outputPath, "replace");
      enqueueDownload(targetUrl, options, {
        approval: "held",
        mirrorHeroUrl: true,
        heroUrlSourceHint: "explorer",
        enqueueSource: "explorerAdd",
        ...(isDevReplaySimulateActive() ? { devSimulateDownload: true } : {}),
      });
    },
    [
      enqueueDownload,
      saveToInternal,
      internalDir,
      outputDir,
      resolveDuplicate,
      promptDuplicateChoice,
      notify,
    ],
  );

  useEffect(() => {
    setDownloaderReplayHandlers({
      handleDownloadClick,
      applyClipboardYoutubeUrl,
      handleUrlChange,
      promoteStagedBarToDownloadQueue,
      handleQuickEnqueueFromClipboard,
      handleDroppedYoutubeUrls,
      replayExplorerAdd,
      setPlaylistItemAudioOverrides,
      setClipboardPastedHint,
    });
    return () => setDownloaderReplayHandlers(null);
  }, [
    handleDownloadClick,
    applyClipboardYoutubeUrl,
    handleUrlChange,
    promoteStagedBarToDownloadQueue,
    handleQuickEnqueueFromClipboard,
    handleDroppedYoutubeUrls,
    replayExplorerAdd,
  ]);

  useEffect(() => {
    let active = true;
    let loadingOwned = false;
    setMetadataError(null);
    if (url.startsWith("http")) {
      const norm = url.trim();
      const preferredQuality = settingsRef.current.preferredQuality;
      const audioOnly = settingsRef.current.downloadAudioOnly;

      const applyHeroFromSnapshot = (snap: ReturnType<typeof videoInfoToDownloadJobSnapshot>) => {
        const resolved = snapshotWithResolvedFileSize(snap, audioOnly);
        setVideoInfo(downloadJobSnapshotToVideoInfo(resolved), {
          sourceUrl: norm,
          preferredQuality,
        });
        setMetadataError(null);
        setDownloaderMetadataLoading(false);
      };

      restoreDownloadQueueFromSessionIfEmpty();
      const st = useRuforgeStore.getState();
      const jobs = jobsForHeroMetadataReuse(st.downloadJobs);
      if (
        st.videoInfo &&
        st.videoInfoUrl &&
        youtubeUrlsMatch(norm, st.videoInfoUrl) &&
        st.videoInfoPreferredQuality === preferredQuality
      ) {
        const snap = videoInfoToDownloadJobSnapshot(st.videoInfo, audioOnly);
        const hasDualSizes =
          (typeof st.videoInfo.fileSizeBytesAudio === "number" &&
            st.videoInfo.fileSizeBytesAudio > 0 &&
            typeof st.videoInfo.fileSizeBytesVideo === "number" &&
            st.videoInfo.fileSizeBytesVideo > 0) ||
          !downloadJobMediaNeedsHydration(snap);
        if (hasDualSizes && !downloadJobMediaNeedsHydration(snap)) {
          if (active) applyHeroFromSnapshot(snap);
          return () => {
            active = false;
          };
        }
      }

      const fillHeroSizesInBackground = (seedSnap: DownloadJobMediaSnapshot) => {
        if (downloadJobDualSizesReady(seedSnap)) return;
        void (async () => {
          try {
            const scheduledUrl = norm;
            const videoFormatBg = ytdlpVideoFormatForMetadata(
              settingsRef.current.preferredQuality,
            );
            const audioOnlyBg = settingsRef.current.downloadAudioOnly;
            const info = await fetchVideoInfoWithTimeout(
              scheduledUrl,
              videoFormatBg,
              audioOnlyBg,
              cookieContextFromSettings(settingsRef.current),
            );
            if (!active || useRuforgeStore.getState().url.trim() !== scheduledUrl) return;
            const base = videoInfoToDownloadJobSnapshot(info, audioOnlyBg);
            const snap = mergeVideoInfoFileSizes(base, info, audioOnlyBg);
            const cacheKey = downloadJobMetadataCacheKey(scheduledUrl, videoFormatBg);
            if (cacheKey) commitDownloadJobMetadataCache(cacheKey, snap);
            const stAfter = useRuforgeStore.getState();
            if (
              !stAfter.videoInfoUrl ||
              !youtubeUrlsMatch(scheduledUrl, stAfter.videoInfoUrl) ||
              stAfter.videoInfoPreferredQuality !== settingsRef.current.preferredQuality
            ) {
              return;
            }
            setVideoInfo(
              downloadJobSnapshotToVideoInfo(snapshotWithResolvedFileSize(snap, audioOnlyBg)),
              {
                sourceUrl: scheduledUrl,
                preferredQuality: settingsRef.current.preferredQuality,
              },
            );
          } catch (e: unknown) {
            console.error(`[RuForge] hero size fill failed: ${e}`);
          }
        })();
      };

      const jobSnap = heroReuseJobSnapshot(jobs, norm);
      if (jobSnap) {
        if (active) {
          applyHeroFromSnapshot(jobSnap);
          fillHeroSizesInBackground(jobSnap);
        }
        return () => {
          active = false;
        };
      }

      const videoFormat = ytdlpVideoFormatForMetadata(preferredQuality);
      const displayCached = peekDownloadJobMetadataCacheForHeroDisplay(norm, videoFormat);
      if (displayCached) {
        if (active) {
          applyHeroFromSnapshot(displayCached);
          fillHeroSizesInBackground(displayCached);
        }
        return () => {
          active = false;
        };
      }

      const cached = peekDownloadJobMetadataCache(norm, videoFormat);
      if (cached) {
        if (active) applyHeroFromSnapshot(cached);
        return () => {
          active = false;
        };
      }

      if (heroHasMatchingJobPendingHydration(jobs, norm)) {
        if (active) setDownloaderMetadataLoading(true);
        loadingOwned = true;
        return () => {
          active = false;
          if (loadingOwned) setDownloaderMetadataLoading(false);
        };
      }

      setDownloaderMetadataLoading(true);
      loadingOwned = true;
      const run = async (scheduledUrl: string) => {
        const norm = scheduledUrl.trim();
        try {
          if (settingsRef.current.skipDuplicatesAutomatically) {
            const rev = useRuforgeStore.getState().libraryScanRevision;
            let list = useRuforgeStore.getState().entries;
            if (
              lastDupCheckLibraryScanRev.current === null ||
              lastDupCheckLibraryScanRev.current !== rev
            ) {
              await useRuforgeStore
                .getState()
                .fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true });
              if (!active) return;
              if (useRuforgeStore.getState().url.trim() !== norm) return;
              lastDupCheckLibraryScanRev.current = useRuforgeStore.getState().libraryScanRevision;
              list = useRuforgeStore.getState().entries;
            }
            if (!isPlaylistDownloaderUrl(norm)) {
              const dup = findLibraryDuplicate(norm, list);
              if (dup) {
                if (active && useRuforgeStore.getState().url.trim() === norm) {
                  skipQueuedJobsForDuplicateHeroUrl(norm, skipDownloadJobAsLibraryDuplicate);
                  setDownloaderUrl("");
                  setDownloaderFocusedJobId(null);
                  setVideoInfo(null);
                  setMetadataError(null);
                  setClipboardPastedHint(false);
                  setClipboardOfferUrl(null);
                  useRuforgeStore
                    .getState()
                    .notify("Duplicate detected, skipping per user settings.", "info");
                }
                return;
              }
            }
          }

          if (!active || useRuforgeStore.getState().url.trim() !== norm) return;
          const videoFormat = ytdlpVideoFormatForMetadata(
            settingsRef.current.preferredQuality,
          );
          const audioOnlyNow = settingsRef.current.downloadAudioOnly;
          const info = await fetchVideoInfoWithTimeout(
            norm,
            videoFormat,
            audioOnlyNow,
            cookieContextFromSettings(settingsRef.current),
          );
          if (active && useRuforgeStore.getState().url.trim() === norm) {
            const base = videoInfoToDownloadJobSnapshot(info, audioOnlyNow);
            const snap = mergeVideoInfoFileSizes(base, info, audioOnlyNow);
            const cacheKey = downloadJobMetadataCacheKey(norm, videoFormat);
            if (cacheKey) commitDownloadJobMetadataCache(cacheKey, snap);
            const heroInfo = downloadJobSnapshotToVideoInfo(snap);

            if (
              settingsRef.current.skipDuplicatesAutomatically &&
              heroInfo.isPlaylist &&
              heroInfo.playlistItems?.length
            ) {
              const plan = buildPlaylistEnqueuePlan(
                heroInfo.playlistItems,
                useRuforgeStore.getState().entries,
                playlistItemAudioOverrides,
                audioOnlyNow,
                true,
              );
              if (
                plan.toDownload.length === 0 &&
                plan.duplicates.length > 0
              ) {
                skipQueuedJobsForDuplicateHeroUrl(norm, skipDownloadJobAsLibraryDuplicate);
                setDownloaderUrl("");
                setDownloaderFocusedJobId(null);
                setVideoInfo(null);
                setMetadataError(null);
                setClipboardPastedHint(false);
                setClipboardOfferUrl(null);
                useRuforgeStore.getState().notify(
                  "All videos in this playlist are already in your library.",
                  "info",
                );
                return;
              }
            }

            setVideoInfo(heroInfo, {
              sourceUrl: norm,
              preferredQuality: settingsRef.current.preferredQuality,
            });
            setMetadataError(null);
          }
        } catch (e: unknown) {
          console.error(`[RuForge] get_video_info failed: ${e}`);
          if (active && useRuforgeStore.getState().url.trim() === norm) {
            setVideoInfo(null);
            setMetadataError(String(e));
          }
        } finally {
          if (active && loadingOwned) setDownloaderMetadataLoading(false);
        }
      };
      const timeoutId = setTimeout(() => {
        void run(useRuforgeStore.getState().url.trim());
      }, 500);
      return () => {
        active = false;
        clearTimeout(timeoutId);
        if (loadingOwned) setDownloaderMetadataLoading(false);
      };
    }
    setVideoInfo(null);
  }, [
    url,
    downloadJobs,
    settings.preferredQuality,
    settings.downloadAudioOnly,
    settings.browserContext,
    settings.cookieFile,
    setMetadataError,
    setDownloaderMetadataLoading,
    setVideoInfo,
    restoreDownloadQueueFromSessionIfEmpty,
  ]);

  return {
    settings,
    url,
    metadataLoading,
    progress,
    videoInfo,
    focusedJob,
    focusedJobId,
    metadataError,
    isFocused,
    replaceDialogOpen,
    replaceDialogMatch,
    clipboardPastedHint,
    urlSourceHint,
    clipboardOfferUrl,
    urlBubbleCopied,
    showUrlBubble,
    showMainUrlChip,
    showQueueAddToolbar,
    showTopLeftDownloaderChrome,
    showDuplicateBanner,
    duplicateBannerAutoSkip,
    libraryDuplicateTitle,
    playlistDuplicateSummary,
    playlistEnqueuePlan,
    playlistHeroDisplayBytes,
    playlistItemAudioOverrides,
    togglePlaylistItemAudio,
    isPlaylistItemDuplicate,
    playlistItemKey,
    resolveAudioOnlyForPlaylistItem,
    queueBrowsingHidesUrlChrome,
    focusShowsBigProgress,
    anyDownloading,
    heroBackdropThumb,
    showPrimaryDownload,
    downloadStartPending,
    showHeroAudioToggle,
    heroAudioOnly,
    showAudioWarning,
    toggleHeroAudio,
    storageBlocksNewDownloads,
    setDownloaderFocusedJobId,
    confirmPendingDownloadJob,
    subLangsForDisplay,
    urlChipLayoutTransition,
    handleBrowserChange,
    handleDownloadClick: () => void handleDownloadClick(),
    handleStopActiveDownload,
    handleDuplicateChoice,
    handleUrlFocus,
    handleUrlClick,
    handleUrlBlur,
    handleUrlPaste,
    applyClipboardOffer,
    handleUrlClipPaste,
    handleUrlClipCopy,
    handleClearUrl,
    handleUrlChange,
    quickEnqueueHint,
    pinnedQuickEnqueueUrls,
    batchQueueJobs,
    batchQueueActive,
    batchQueueJobIds,
    batchDownloadCarousel,
    playlistDownloadCarousel,
    collectionDownloadCarousel,
    showImmersiveDownload,
    batchQueuePlaylistView,
    batchQueueHeroDisplayBytes,
    toggleBatchQueueJobAudio,
    isBatchQueueJobDuplicate,
    removePinnedQuickEnqueueUrl,
    copyUrlToClipboard,
    handleQuickEnqueueFromClipboard,
    showYtdlpStrip,
    ytdlpUpdateStatus,
    ytdlpUpdateLoading,
    ytdlpUpdating,
    ytdlpUpdatePercent,
    ytdlpUpdateInvokeError,
    dismissYtdlpUpdateBanner,
    downloadYtdlpUpdateNow,
    browserContextUi: browserContextForDownloaderUi(settings.browserContext),
  };
}

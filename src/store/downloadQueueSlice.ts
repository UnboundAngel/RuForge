import { invoke } from "@tauri-apps/api/core";
import type { StateCreator, StoreApi } from "zustand";
import {
  fetchVideoInfoForQueueHydration,
  videoInfoFetchInflightKey,
} from "../downloadVideoInfoFetch";
import { downloadQueueHydrationPool } from "../downloadQueueHydrationPool";
import {
  mergeDownloadProgressWithSmoothing,
  resetDownloadProgressEtaSmoothing,
} from "../downloadProgress";
import {
  collapseDownloadJobsByUrl,
  createDownloadJobId,
  downloadJobMediaNeedsHydration,
  LIBRARY_DUPLICATE_SKIP_MESSAGE,
  LIBRARY_DUPLICATE_SKIP_ROW_MS,
  DOWNLOAD_TIMED_OUT_MESSAGE,
  patchDownloadJobOptionsForAudio,
  patchDownloadJobOptionsFromSettings,
  persistDownloadJobs,
  restoreDownloadQueueFromSessionIfEmpty,
  toInvokeDownloadOptions,
  videoInfoToDownloadJobSnapshot,
  type DownloadJob,
  type DownloadJobApproval,
  type DownloadJobFinishedPayload,
  type DownloadEnqueueSource,
  type DownloadJobMediaSnapshot,
  type DownloadJobOptions,
  DEFAULT_MAX_CONCURRENT_DOWNLOADS,
} from "../downloadQueue";
import type { ProgressPayload } from "../types";
import {
  appendOutputPathToLastBatch,
  appendReplayOutputPath,
  commitLastDownloadBatchFromJobs,
  devBatchToolsEnabled,
  isDevReplayOutputCaptureActive,
} from "../lib/devLastDownloadBatch";
import type { RuforgeStore } from "./ruforgeStore";
import {
  ytdlpFormatForDownloadJob,
  ytdlpVideoFormatForMetadata,
} from "../downloadFormat";
import {
  mergeVideoInfoFileSizes,
  snapshotWithResolvedFileSize,
} from "../downloadJobFileSizes";
import {
  commitDownloadJobMetadataCache,
  downloadJobMetadataCacheKey,
  evictDownloadJobMetadataCacheWhenIdle,
  peekDownloadJobMetadataCache,
} from "../downloadQueueMetadataCache";
import {
  armDownloadJobWatchdog,
  disarmDownloadJobWatchdog,
  initDownloadJobWatchdog,
  touchDownloadJobWatchdog,
  progressAdvancesDownloadWatchdog,
} from "../downloadJobWatchdog";
import { deliverUserNotification } from "../systemNotify";
import { findLibraryDuplicate } from "../duplicateDownload";
import { youtubeUrlsMatch } from "../youtubeUrl";

/** Coalesce `persistDownloadJobs` when many hydrates finish back-to-back (e.g. startup sweep). */
const DOWNLOAD_JOB_HYDRATE_PERSIST_DEBOUNCE_MS = 75;
let hydratePersistTimeout: ReturnType<typeof setTimeout> | null = null;

const skippedJobRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const timedOutJobRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Match collapsed music explore celebration duration. */
const TIMED_OUT_JOB_ROW_MS = 2100;

/** Coalesce gallery scans when duplicate-skip needs library rows before yt-dlp. */
let entriesFetchForDuplicateCheckInflight: Promise<void> | null = null;

async function ensureEntriesForDuplicateCheck(get: () => RuforgeStore): Promise<void> {
  if (!get().settings.skipDuplicatesAutomatically) return;
  if (get().entries.length > 0) return;
  if (!entriesFetchForDuplicateCheckInflight) {
    entriesFetchForDuplicateCheckInflight = get()
      .fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true })
      .then(() => undefined)
      .finally(() => {
        entriesFetchForDuplicateCheckInflight = null;
      });
  }
  await entriesFetchForDuplicateCheckInflight;
}

function isYtDlpStartCancelledError(message: string): boolean {
  return /cancelled before yt-dlp could start/i.test(message);
}

function clearSkippedJobRemovalTimer(jobId: string): void {
  const t = skippedJobRemovalTimers.get(jobId);
  if (t) {
    clearTimeout(t);
    skippedJobRemovalTimers.delete(jobId);
  }
}

function shouldAutoSkipLibraryDuplicate(get: () => RuforgeStore, url: string): boolean {
  if (!get().settings.skipDuplicatesAutomatically) return false;
  return findLibraryDuplicate(url, get().entries) != null;
}

function markJobSkippedLibraryDuplicate(jobs: DownloadJob[], jobId: string): DownloadJob[] {
  return jobs.map((j) =>
    j.id === jobId
      ? {
          ...j,
          status: "skipped" as const,
          error: LIBRARY_DUPLICATE_SKIP_MESSAGE,
          progress: null,
          resumeOnStart: false,
        }
      : j,
  );
}

function clearTimedOutJobRemovalTimer(jobId: string): void {
  const t = timedOutJobRemovalTimers.get(jobId);
  if (t) {
    clearTimeout(t);
    timedOutJobRemovalTimers.delete(jobId);
  }
}

function scheduleTimedOutJobRemoval(get: () => RuforgeStore, jobId: string): void {
  if (timedOutJobRemovalTimers.has(jobId)) return;
  const timer = setTimeout(() => {
    timedOutJobRemovalTimers.delete(jobId);
    void get().removeDownloadJob(jobId);
  }, TIMED_OUT_JOB_ROW_MS);
  timedOutJobRemovalTimers.set(jobId, timer);
}

function scheduleSkippedJobRemoval(get: () => RuforgeStore, jobId: string): void {
  if (skippedJobRemovalTimers.has(jobId)) return;
  const timer = setTimeout(() => {
    skippedJobRemovalTimers.delete(jobId);
    void get().removeDownloadJob(jobId);
  }, LIBRARY_DUPLICATE_SKIP_ROW_MS);
  skippedJobRemovalTimers.set(jobId, timer);
}

/** Returns true when the job was marked `skipped` (caller must not start yt-dlp). */
async function trySkipLibraryDuplicateJob(
  get: () => RuforgeStore,
  jobId: string,
  url: string,
): Promise<boolean> {
  if (!get().settings.skipDuplicatesAutomatically) return false;
  await ensureEntriesForDuplicateCheck(get);
  if (!findLibraryDuplicate(url, get().entries)) return false;
  const job = get().downloadJobs.find((j) => j.id === jobId);
  if (!job || job.status === "skipped") return true;
  get().skipDownloadJobAsLibraryDuplicate(jobId);
  return true;
}

function schedulePersistAfterDownloadJobHydrate(get: () => RuforgeStore): void {
  if (hydratePersistTimeout !== null) {
    clearTimeout(hydratePersistTimeout);
  }
  hydratePersistTimeout = setTimeout(() => {
    hydratePersistTimeout = null;
    persistDownloadJobs(get().downloadJobs);
  }, DOWNLOAD_JOB_HYDRATE_PERSIST_DEBOUNCE_MS);
}

async function hydrateDownloadJobMetadata(
  get: () => RuforgeStore,
  set: StoreApi<RuforgeStore>["setState"],
  jobId: string,
  url: string,
): Promise<void> {
  const seed = get().downloadJobs.find((j) => j.id === jobId);
  if (!seed || !downloadJobMediaNeedsHydration(seed.metadata)) return;
  const applySnapshot = (snapshot: DownloadJobMediaSnapshot) => {
    set((s) => {
      const cur = s.downloadJobs.find((j) => j.id === jobId);
      if (!cur) return {};
      return {
        downloadJobs: s.downloadJobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                metadata: snapshot,
                title: j.title?.trim() ? j.title : snapshot.title,
              }
            : j,
        ),
      };
    });
    schedulePersistAfterDownloadJobHydrate(get);
  };

  const urlTrim = url.trim();
  const audioOnly = seed.options.audioOnly === true;
  try {
    const seedJob = get().downloadJobs.find((j) => j.id === jobId);
    const format = ytdlpFormatForDownloadJob(
      seedJob?.options ?? { audioOnly },
      get().settings,
    );
    const videoFormat = ytdlpVideoFormatForMetadata(
      get().settings.preferredQuality,
      format.includes("bestaudio") ? undefined : format,
    );
    const cacheKey = downloadJobMetadataCacheKey(urlTrim, videoFormat);

    const cached = peekDownloadJobMetadataCache(urlTrim, videoFormat);
    if (cached) {
      applySnapshot(snapshotWithResolvedFileSize(cached, audioOnly));
      return;
    }

    const cookieCtx = {
      browserCookies: seed.options.browserCookies,
      cookieFile: seed.options.cookieFile,
    };
    const inflightKey = videoInfoFetchInflightKey(urlTrim, videoFormat, cookieCtx, true);

    const info = await downloadQueueHydrationPool.run(inflightKey, () =>
      fetchVideoInfoForQueueHydration(urlTrim, videoFormat, audioOnly, cookieCtx),
    );
    const base = videoInfoToDownloadJobSnapshot(info, audioOnly);
    const snap = mergeVideoInfoFileSizes(base, info, audioOnly);
    commitDownloadJobMetadataCache(cacheKey, snap);
    applySnapshot(snapshotWithResolvedFileSize(snap, audioOnly));
  } catch {
    const cur = get().downloadJobs.find((j) => j.id === jobId);
    if (!cur || !downloadJobMediaNeedsHydration(cur.metadata)) return;
    const fallbackTitle =
      cur.title?.trim() || cur.metadata?.title?.trim() || cur.url.trim() || "Video";
    const snapshot: DownloadJobMediaSnapshot = {
      title: fallbackTitle,
      thumbnail: cur.metadata?.thumbnail ?? "",
      duration: cur.metadata?.duration ?? 0,
      isPlaylist: Boolean(cur.metadata?.isPlaylist),
      playlistItems: cur.metadata?.playlistItems,
      fileSizeBytes: cur.metadata?.fileSizeBytes ?? null,
      fileSizeBytesAudio: cur.metadata?.fileSizeBytesAudio ?? null,
      fileSizeBytesVideo: cur.metadata?.fileSizeBytesVideo ?? null,
      uploader: cur.metadata?.uploader,
      channel: cur.metadata?.channel,
    };
    applySnapshot(snapshotWithResolvedFileSize(snapshot, audioOnly));
  }
}

/** Legacy hero bindings mirror `focusedJobId` when that job is downloading. */
/** Clear downloader hero fields when they still show a URL that just finished or was removed. */
const HERO_CLEAR_FIELDS = {
  url: "",
  urlSourceHint: null,
  videoInfo: null,
  videoInfoUrl: null,
  videoInfoPreferredQuality: null,
  metadataError: null,
} as const;

function heroClearPatchForUrl(
  state: Pick<RuforgeStore, "url">,
  matchUrl: string | undefined,
): Partial<typeof HERO_CLEAR_FIELDS> {
  if (!matchUrl?.trim()) return {};
  const heroUrl = state.url.trim();
  if (!heroUrl || !youtubeUrlsMatch(heroUrl, matchUrl)) return {};
  return { ...HERO_CLEAR_FIELDS };
}

/** Drop bar + hero metadata when the URL is no longer represented in the queue. */
function heroClearWhenUrlNotInQueue(
  state: Pick<RuforgeStore, "url">,
  jobs: DownloadJob[],
): Partial<typeof HERO_CLEAR_FIELDS> {
  const heroUrl = state.url.trim();
  if (!heroUrl.startsWith("http")) return {};
  if (jobs.some((j) => youtubeUrlsMatch(j.url, heroUrl))) return {};
  return { ...HERO_CLEAR_FIELDS };
}

function heroMirrorPatchFromEnqueueMeta(
  meta:
    | {
        mirrorHeroUrl?: boolean;
        heroUrlSourceHint?: "explorer";
      }
    | undefined,
  urlTrim: string,
): Partial<Pick<RuforgeStore, "url" | "urlSourceHint">> {
  if (!meta?.mirrorHeroUrl) return {};
  return {
    url: urlTrim,
    urlSourceHint: meta.heroUrlSourceHint ?? "explorer",
  };
}

/** Explorer add mirrors URL into hero; focus the new row so Download tab is not blank. */
function heroEnqueueUiPatch(
  meta:
    | {
        mirrorHeroUrl?: boolean;
        heroUrlSourceHint?: "explorer";
      }
    | undefined,
  urlTrim: string,
  downloadJobs: DownloadJob[],
): Partial<
  Pick<RuforgeStore, "url" | "urlSourceHint" | "focusedJobId"> & {
    downloading: boolean;
    progress: ProgressPayload | null;
    activeDownloadJobId: string | null;
  }
> {
  const mirror = heroMirrorPatchFromEnqueueMeta(meta, urlTrim);
  if (!meta?.mirrorHeroUrl) return mirror;
  const job = downloadJobs.find(
    (j) =>
      youtubeUrlsMatch(j.url, urlTrim) &&
      j.status !== "completed" &&
      j.status !== "failed" &&
      j.status !== "skipped" &&
      j.status !== "timed_out",
  );
  const focusedJobId = job?.id ?? null;
  return {
    ...mirror,
    focusedJobId,
    ...syncLegacyDownloaderUi(downloadJobs, focusedJobId),
  };
}

function syncLegacyDownloaderUi(
  jobs: DownloadJob[],
  focusedJobId: string | null,
): {
  downloading: boolean;
  progress: ProgressPayload | null;
  activeDownloadJobId: string | null;
} {
  if (!focusedJobId) {
    return { downloading: false, progress: null, activeDownloadJobId: null };
  }
  const j = jobs.find((x) => x.id === focusedJobId);
  if (!j || j.status !== "downloading") {
    return { downloading: false, progress: null, activeDownloadJobId: focusedJobId };
  }
  return {
    downloading: true,
    progress: j.progress,
    activeDownloadJobId: focusedJobId,
  };
}

function resolveFocusAfterMutation(
  jobs: DownloadJob[],
  prevFocus: string | null,
): string | null {
  const downloading = jobs.filter((j) => j.status === "downloading");
  if (downloading.length > 0) {
    if (prevFocus && downloading.some((j) => j.id === prevFocus)) {
      return prevFocus;
    }
    return downloading[0]!.id;
  }
  if (prevFocus) {
    const j = jobs.find((x) => x.id === prevFocus);
    if (
      j &&
      j.status !== "completed" &&
      j.status !== "failed" &&
      j.status !== "skipped" &&
      j.status !== "timed_out"
    ) {
      return prevFocus;
    }
  }
  return (
    jobs.find((j) => j.status === "queued" || j.status === "paused")?.id ?? null
  );
}

export type DownloadQueueSlice = {
  downloadJobs: DownloadJob[];
  focusedJobId: string | null;
  maxConcurrentDownloads: number;
  activeDownloadJobId: string | null;

  setDownloaderFocusedJobId: (id: string | null) => void;
  confirmPendingDownloadJob: (jobId: string, approve: boolean) => void;
  /** Pre-download rows (`held`) become pump-eligible (`auto`) when the user clicks Download. */
  releaseHeldDownloadJobs: () => void;
  /** After reload, re-fetch `get_video_info` for queued/paused rows with thin metadata. */
  queueHydrateOrphanMetadata: () => void;
  /** When in-memory queue is empty but sessionStorage still has rows, restore into the store. */
  restoreDownloadQueueFromSessionIfEmpty: () => void;

  enqueueDownload: (
    url: string,
    options: DownloadJobOptions,
    meta?: {
      snapshot?: DownloadJobMediaSnapshot;
      title?: string;
      approval?: DownloadJobApproval;
      /** Mirror URL into hero bar in the same store update (explorer add). */
      mirrorHeroUrl?: boolean;
      heroUrlSourceHint?: "explorer";
      enqueueSource?: DownloadEnqueueSource;
      devSimulateDownload?: boolean;
    },
  ) => string;
  pauseDownloadJob: (id: string) => Promise<void>;
  resumeDownloadJob: (id: string) => Promise<void>;
  retryDownloadJob: (id: string) => void;
  removeDownloadJob: (id: string) => Promise<void>;
  /** Auto-skip duplicates: show `skipped` row briefly, then remove. */
  skipDownloadJobAsLibraryDuplicate: (id: string) => void;
  reorderDownloadJobs: (fromIndex: number, toIndex: number) => void;
  setDownloadJobAudioOnly: (jobId: string, audioOnly: boolean) => void;
  /** Queued/paused rows pick up subtitle + scrubber prefs from Settings. */
  syncQueuedJobMediaOptionsFromSettings: () => void;
  applyDownloadProgress: (payload: ProgressPayload) => void;
  onDownloadJobFinished: (payload: DownloadJobFinishedPayload) => void;
  onDownloadJobPaused: (jobId: string) => void;
  pumpDownloadQueue: () => void;
};

const DOWNLOAD_STALL_ERROR =
  "Download stalled (no progress from yt-dlp). Check your connection, then Retry or Resume.";

function handleStalledDownloadJob(get: () => RuforgeStore): (jobId: string) => void {
  return (jobId) => {
    void (async () => {
      const job = get().downloadJobs.find((j) => j.id === jobId);
      if (!job || job.status !== "downloading") return;

      try {
        await invoke("pause_download_job", { jobId });
      } catch (e) {
        console.warn("[RuForge] stall cleanup pause_download_job:", e);
      }

      const latest = get().downloadJobs.find((j) => j.id === jobId);
      if (!latest || latest.status !== "downloading") return;

      get().onDownloadJobFinished({
        jobId,
        url: job.url,
        success: false,
        error: DOWNLOAD_STALL_ERROR,
      });
    })();
  };
}

function handleTimedOutDownloadJob(get: () => RuforgeStore): (jobId: string) => void {
  return (jobId) => {
    void (async () => {
      const job = get().downloadJobs.find((j) => j.id === jobId);
      if (!job || job.status !== "downloading") return;

      try {
        await invoke("pause_download_job", { jobId });
      } catch (e) {
        console.warn("[RuForge] timeout cleanup pause_download_job:", e);
      }

      const latest = get().downloadJobs.find((j) => j.id === jobId);
      if (!latest || latest.status !== "downloading") return;

      get().onDownloadJobFinished({
        jobId,
        url: job.url,
        success: false,
        timedOut: true,
        error: DOWNLOAD_TIMED_OUT_MESSAGE,
      });
    })();
  };
}

export const createDownloadQueueSlice: StateCreator<
  RuforgeStore,
  [],
  [],
  DownloadQueueSlice
> = (set, get) => {
  initDownloadJobWatchdog(get, handleStalledDownloadJob(get), handleTimedOutDownloadJob(get));

  function startHydratedDownloadJob(
    jobId: string,
    url: string,
    resume: boolean,
  ): void {
    void (async () => {
      try {
        if (await trySkipLibraryDuplicateJob(get, jobId, url)) {
          get().pumpDownloadQueue();
          return;
        }
        await hydrateDownloadJobMetadata(get, set, jobId, url);
        const job = get().downloadJobs.find((j) => j.id === jobId);
        if (!job || job.status !== "downloading") {
          return;
        }
        if (await trySkipLibraryDuplicateJob(get, jobId, url)) {
          get().pumpDownloadQueue();
          return;
        }
        if (
          job.devSimulateDownload &&
          import.meta.env.DEV &&
          get().settings.showDebuggingSettings === true
        ) {
          get().applyDownloadProgress({
            jobId,
            percentage: 50,
            speed: "0 B/s",
            eta: "0:00",
            status: "downloading",
          });
          get().onDownloadJobFinished({
            jobId,
            url,
            success: true,
          });
          return;
        }
        armDownloadJobWatchdog(jobId);
        const invokeOptions = toInvokeDownloadOptions(job.options);
        await invoke("start_download_job", {
          jobId,
          url,
          options: invokeOptions,
          resume,
        });
      } catch (e) {
        const msg = String(e);
        if (isYtDlpStartCancelledError(msg)) {
          if (await trySkipLibraryDuplicateJob(get, jobId, url)) {
            disarmDownloadJobWatchdog(jobId);
            get().pumpDownloadQueue();
            return;
          }
        }
        get().onDownloadJobFinished({
          jobId,
          url,
          success: false,
          error: msg,
        });
      }
    })();
  }

  /** Promote queued+auto jobs until at capacity; returns jobs to start (hydrate+invoke). */
  function promoteEligibleJobs(
    downloadJobs: DownloadJob[],
    max: number,
    getStore: () => RuforgeStore,
  ): {
    jobs: DownloadJob[];
    starts: { id: string; url: string; resume: boolean }[];
    skippedIds: string[];
  } {
    let jobs = collapseDownloadJobsByUrl(downloadJobs);
    const starts: { id: string; url: string; resume: boolean }[] = [];
    const skippedIds: string[] = [];
    let running = jobs.filter((j) => j.status === "downloading").length;

    while (running < max) {
      const next = jobs.find(
        (j) =>
          j.status === "queued" &&
          j.approval === "auto" &&
          !jobs.some(
            (other) =>
              other.status === "downloading" &&
              youtubeUrlsMatch(other.url, j.url),
          ),
      );
      if (!next) break;

      if (shouldAutoSkipLibraryDuplicate(getStore, next.url)) {
        jobs = markJobSkippedLibraryDuplicate(jobs, next.id);
        skippedIds.push(next.id);
        continue;
      }

      starts.push({
        id: next.id,
        url: next.url,
        resume: Boolean(next.resumeOnStart),
      });
      const now = Date.now();
      jobs = jobs.map((j) =>
        j.id === next.id
          ? {
              ...j,
              status: "downloading" as const,
              error: null,
              resumeOnStart: false,
              downloadingSince: now,
            }
          : j,
      );
      running++;
    }
    return { jobs, starts, skippedIds };
  }

  return {
    downloadJobs: [],
    focusedJobId: null,
    maxConcurrentDownloads: DEFAULT_MAX_CONCURRENT_DOWNLOADS,
    activeDownloadJobId: null,

    setDownloaderFocusedJobId: (id) => {
      set((s) => ({
        focusedJobId: id,
        ...syncLegacyDownloaderUi(s.downloadJobs, id),
      }));
      if (!id) return;
      const job = get().downloadJobs.find((j) => j.id === id);
      if (job && downloadJobMediaNeedsHydration(job.metadata)) {
        void hydrateDownloadJobMetadata(get, set, job.id, job.url);
      }
    },

    queueHydrateOrphanMetadata: () => {
      get().restoreDownloadQueueFromSessionIfEmpty();
      for (const j of get().downloadJobs) {
        if (
          (j.status === "queued" || j.status === "paused") &&
          downloadJobMediaNeedsHydration(j.metadata)
        ) {
          void hydrateDownloadJobMetadata(get, set, j.id, j.url);
        }
      }
    },

    restoreDownloadQueueFromSessionIfEmpty: () => {
      const s = get();
      const patch = restoreDownloadQueueFromSessionIfEmpty(
        s.downloadJobs,
        s.focusedJobId,
      );
      if (!patch) return;
      set({
        downloadJobs: patch.downloadJobs,
        focusedJobId: patch.focusedJobId,
      });
    },

    confirmPendingDownloadJob: (jobId, approve) => {
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) =>
          j.id === jobId && j.status === "queued" && j.approval === "pending"
            ? { ...j, approval: approve ? ("auto" as const) : ("manual" as const) }
            : j,
        );
        persistDownloadJobs(downloadJobs);
        return { downloadJobs };
      });
      if (approve) {
        get().pumpDownloadQueue();
      }
    },

    releaseHeldDownloadJobs: () => {
      const held = get()
        .downloadJobs.filter((j) => j.status === "queued" && j.approval === "held")
        .sort((a, b) => a.createdAt - b.createdAt);
      if (held.length > 0 && devBatchToolsEnabled()) {
        const st = get();
        commitLastDownloadBatchFromJobs(held, {
          heroUrl: st.url,
          heroVideoInfo:
            st.videoInfo != null
              ? videoInfoToDownloadJobSnapshot(st.videoInfo)
              : null,
        });
      }
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) =>
          j.status === "queued" && j.approval === "held"
            ? { ...j, approval: "auto" as const }
            : j,
        );
        persistDownloadJobs(downloadJobs);
        return { downloadJobs };
      });
    },

    enqueueDownload: (url, options, meta) => {
      get().restoreDownloadQueueFromSessionIfEmpty();
      const urlTrim = url.trim();
      const approval: DownloadJobApproval = meta?.approval ?? "auto";
      const snapshot =
        meta?.snapshot ??
        (meta?.title?.trim()
          ? ({
              title: meta.title.trim(),
              thumbnail: "",
              duration: 0,
              isPlaylist: false,
            } satisfies DownloadJobMediaSnapshot)
          : null);

      const existing = get().downloadJobs.find(
        (j) =>
          youtubeUrlsMatch(j.url, urlTrim) &&
          (j.status === "queued" ||
            j.status === "paused" ||
            j.status === "downloading"),
      );
      if (existing) {
        if (existing.status === "downloading") {
          return existing.id;
        }
        set((s) => {
          let downloadJobs = s.downloadJobs.map((j) => {
            if (j.id !== existing.id) return j;
            const metadata = snapshot
              ? snapshotWithResolvedFileSize(snapshot, options.audioOnly === true)
              : j.metadata
                ? snapshotWithResolvedFileSize(j.metadata, options.audioOnly === true)
                : j.metadata;
            return {
              ...j,
              options,
              title: meta?.title?.trim() ? meta.title : j.title,
              metadata,
              approval:
                j.status === "paused"
                  ? j.approval
                  : approval === "held"
                    ? ("held" as const)
                    : approval,
              error: null,
              ...(meta?.enqueueSource ? { enqueueSource: meta.enqueueSource } : {}),
              ...(meta?.devSimulateDownload ? { devSimulateDownload: true } : {}),
            };
          });
          downloadJobs = collapseDownloadJobsByUrl(downloadJobs);
          persistDownloadJobs(downloadJobs);
          return {
            downloadJobs,
            ...heroEnqueueUiPatch(meta, urlTrim, downloadJobs),
          };
        });
        const merged = get().downloadJobs.find((j) => j.id === existing.id);
        if (merged && downloadJobMediaNeedsHydration(merged.metadata)) {
          void hydrateDownloadJobMetadata(get, set, existing.id, urlTrim);
        }
        return existing.id;
      }

      const id = createDownloadJobId();
      const job: DownloadJob = {
        id,
        url: urlTrim,
        title: snapshot?.title ?? meta?.title,
        metadata: snapshot,
        status: "queued",
        approval,
        progress: null,
        error: null,
        options,
        createdAt: Date.now(),
        resumeOnStart: false,
        ...(meta?.enqueueSource ? { enqueueSource: meta.enqueueSource } : {}),
        ...(meta?.devSimulateDownload ? { devSimulateDownload: true } : {}),
      };
      set((s) => {
        const downloadJobs = collapseDownloadJobsByUrl([...s.downloadJobs, job]);
        persistDownloadJobs(downloadJobs);
        return {
          downloadJobs,
          ...heroEnqueueUiPatch(meta, urlTrim, downloadJobs),
        };
      });
      const kept = get().downloadJobs.find(
        (j) => youtubeUrlsMatch(j.url, urlTrim) && j.status !== "failed",
      );
      const keptId = kept?.id ?? id;
      if (kept && downloadJobMediaNeedsHydration(kept.metadata)) {
        void hydrateDownloadJobMetadata(get, set, keptId, urlTrim);
      }
      if (get().settings.skipDuplicatesAutomatically) {
        void (async () => {
          await ensureEntriesForDuplicateCheck(get);
          if (shouldAutoSkipLibraryDuplicate(get, urlTrim)) {
            get().skipDownloadJobAsLibraryDuplicate(keptId);
          }
        })();
      }
      return keptId;
    },

    skipDownloadJobAsLibraryDuplicate: (id) => {
      const job = get().downloadJobs.find((j) => j.id === id);
      if (!job || job.status === "skipped") return;

      set((s) => {
        const downloadJobs = markJobSkippedLibraryDuplicate(s.downloadJobs, id);
        persistDownloadJobs(downloadJobs);
        const focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);
        return {
          downloadJobs,
          focusedJobId: focus,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
        };
      });
      scheduleSkippedJobRemoval(get, id);
    },

    pauseDownloadJob: async (id) => {
      const job = get().downloadJobs.find((j) => j.id === id);
      if (!job) return;
      disarmDownloadJobWatchdog(id);

      if (job.status === "downloading") {
        try {
          await invoke("pause_download_job", { jobId: id });
        } catch (e) {
          // Backend kill failed (process may already be gone). Still force UI
          // out of "downloading" so the job doesn't appear permanently stuck.
          console.error("[RuForge] pause_download_job failed — forcing paused state", e);
        }
        set((s) => {
          const downloadJobs = s.downloadJobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "paused" as const,
                  approval: "manual" as const,
                  resumeOnStart: true,
                  progress: j.progress,
                }
              : j,
          );
          persistDownloadJobs(downloadJobs);
          const focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);
          return {
            downloadJobs,
            focusedJobId: focus,
            ...syncLegacyDownloaderUi(downloadJobs, focus),
          };
        });
        get().pumpDownloadQueue();
        return;
      }

      if (job.status === "queued") {
        set((s) => {
          const downloadJobs = s.downloadJobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "paused" as const,
                  approval: "manual" as const,
                  resumeOnStart: true,
                }
              : j,
          );
          persistDownloadJobs(downloadJobs);
          return { downloadJobs };
        });
      }
    },

    resumeDownloadJob: async (id) => {
      const job = get().downloadJobs.find((j) => j.id === id);
      if (!job || job.status !== "paused") return;

      if (await trySkipLibraryDuplicateJob(get, id, job.url)) {
        get().pumpDownloadQueue();
        return;
      }

      const running = get().downloadJobs.filter((j) => j.status === "downloading").length;
      const atCapacity = running >= get().maxConcurrentDownloads;

      const resumeNow = Date.now();
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) =>
          j.id === id
            ? {
                ...j,
                status: (atCapacity ? "queued" : "downloading") as DownloadJob["status"],
                approval: "auto" as const,
                error: null,
                resumeOnStart: true,
                downloadingSince: atCapacity ? j.downloadingSince : resumeNow,
              }
            : j,
        );
        persistDownloadJobs(downloadJobs);
        const focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);
        return {
          downloadJobs,
          focusedJobId: focus,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
        };
      });

      if (atCapacity) {
        get().pumpDownloadQueue();
        return;
      }

      try {
        if (await trySkipLibraryDuplicateJob(get, id, job.url)) {
          get().pumpDownloadQueue();
          return;
        }
        await hydrateDownloadJobMetadata(get, set, id, job.url);
        const latest = get().downloadJobs.find((j) => j.id === id);
        if (!latest || latest.status !== "downloading") {
          return;
        }
        if (await trySkipLibraryDuplicateJob(get, id, job.url)) {
          get().pumpDownloadQueue();
          return;
        }
        armDownloadJobWatchdog(id);
        await invoke("start_download_job", {
          jobId: id,
          url: job.url,
          options: toInvokeDownloadOptions(job.options),
          resume: true,
        });
      } catch (e) {
        disarmDownloadJobWatchdog(id);
        const msg = String(e);
        if (
          isYtDlpStartCancelledError(msg) &&
          (await trySkipLibraryDuplicateJob(get, id, job.url))
        ) {
          get().pumpDownloadQueue();
          return;
        }
        get().onDownloadJobFinished({
          jobId: id,
          url: job.url,
          success: false,
          error: msg,
        });
      }
    },

    retryDownloadJob: (id) => {
      const job = get().downloadJobs.find((j) => j.id === id);
      if (!job || (job.status !== "failed" && job.status !== "timed_out")) return;
      clearTimedOutJobRemovalTimer(id);
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) =>
          j.id === id
            ? {
                ...j,
                status: "queued" as const,
                approval: "auto" as const,
                error: null,
                progress: null,
                resumeOnStart: false,
                createdAt: Date.now(),
              }
            : j,
        );
        persistDownloadJobs(downloadJobs);
        return { downloadJobs };
      });
      get().pumpDownloadQueue();
    },

    removeDownloadJob: async (id) => {
      const job = get().downloadJobs.find((j) => j.id === id);
      if (!job) return;
      disarmDownloadJobWatchdog(id);
      clearSkippedJobRemovalTimer(id);
      clearTimedOutJobRemovalTimer(id);
      if (job.status === "downloading") {
        await get().pauseDownloadJob(id);
      }
      set((s) => {
        const downloadJobs = s.downloadJobs.filter((j) => j.id !== id);
        persistDownloadJobs(downloadJobs);
        const focus =
          s.focusedJobId === id
            ? resolveFocusAfterMutation(downloadJobs, null)
            : resolveFocusAfterMutation(downloadJobs, s.focusedJobId);
        return {
          downloadJobs,
          focusedJobId: focus,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
          ...heroClearWhenUrlNotInQueue(s, downloadJobs),
        };
      });
      // Manual queue removal (explorer toggle, dismiss row, etc.) must not drop
      // localStorage metadata; hero paste and re-add reuse it. Idle eviction after
      // download finish + LRU cap handle cleanup instead.
      get().pumpDownloadQueue();
    },

    reorderDownloadJobs: (fromIndex, toIndex) => {
      set((s) => {
        const jobs = [...s.downloadJobs];
        const movable = (j: DownloadJob) =>
          j.status === "queued" || j.status === "paused";
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= jobs.length ||
          toIndex >= jobs.length ||
          !movable(jobs[fromIndex]!)
        ) {
          return s;
        }
        const [item] = jobs.splice(fromIndex, 1);
        jobs.splice(toIndex, 0, item!);
        persistDownloadJobs(jobs);
        return { downloadJobs: jobs };
      });
      get().pumpDownloadQueue();
    },

    setDownloadJobAudioOnly: (jobId, audioOnly) => {
      const settings = get().settings;
      let changed = false;
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) => {
          if (j.id !== jobId) return j;
          if (j.status !== "queued" && j.status !== "paused") return j;
          if (j.options.audioOnly === audioOnly) return j;
          changed = true;
          const metadata = j.metadata
            ? snapshotWithResolvedFileSize(j.metadata, audioOnly)
            : j.metadata;
          return {
            ...j,
            options: patchDownloadJobOptionsForAudio(j.options, audioOnly, settings),
            metadata,
          };
        });
        if (!changed) return s;
        persistDownloadJobs(downloadJobs);
        return { downloadJobs };
      });
      if (!changed) return;
      if (settings.rememberAudioOnlyDefault && settings.downloadAudioOnly !== audioOnly) {
        void get().updateSetting("downloadAudioOnly", audioOnly);
      }
    },

    syncQueuedJobMediaOptionsFromSettings: () => {
      const settings = get().settings;
      let changed = false;
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) => {
          if (j.status !== "queued" && j.status !== "paused") return j;
          const options = patchDownloadJobOptionsFromSettings(j.options, settings);
          if (options === j.options) return j;
          changed = true;
          return { ...j, options };
        });
        if (!changed) return s;
        persistDownloadJobs(downloadJobs);
        return { downloadJobs };
      });
    },

    applyDownloadProgress: (payload) => {
      const prevJob = get().downloadJobs.find((j) => j.id === payload.jobId);
      const prevProgress = prevJob?.progress ?? null;
      const advancesWatchdog = progressAdvancesDownloadWatchdog(prevProgress, payload);

      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) => {
          if (
            j.id !== payload.jobId ||
            j.status === "completed" ||
            j.status === "failed" ||
            j.status === "timed_out"
          ) {
            return j;
          }
          const progress = mergeDownloadProgressWithSmoothing(
            j.id,
            j.progress,
            payload,
          );
          return { ...j, progress };
        });
        let focus = s.focusedJobId;
        const payloadJob = downloadJobs.find((j) => j.id === payload.jobId);
        const focusedJob = focus ? downloadJobs.find((j) => j.id === focus) : null;
        if (payloadJob?.status === "downloading" && focusedJob?.status !== "downloading") {
          focus = payload.jobId;
        }
        return {
          downloadJobs,
          focusedJobId: focus,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
        };
      });
      const job = get().downloadJobs.find((j) => j.id === payload.jobId);
      if (job?.status === "downloading" && advancesWatchdog) {
        touchDownloadJobWatchdog(payload.jobId);
      }
    },

    onDownloadJobPaused: (jobId) => {
      disarmDownloadJobWatchdog(jobId);
      resetDownloadProgressEtaSmoothing(jobId);
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) =>
          j.id === jobId && j.status !== "paused"
            ? {
                ...j,
                status: "paused" as const,
                approval: "manual" as const,
                resumeOnStart: true,
              }
            : j,
        );
        persistDownloadJobs(downloadJobs);
        const focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);
        return {
          downloadJobs,
          focusedJobId: focus,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
        };
      });
      get().pumpDownloadQueue();
    },

    onDownloadJobFinished: (payload) => {
      disarmDownloadJobWatchdog(payload.jobId);
      resetDownloadProgressEtaSmoothing(payload.jobId);
      if (payload.success && payload.outputPath && payload.url?.trim()) {
        if (isDevReplayOutputCaptureActive()) {
          appendReplayOutputPath(payload.url, payload.outputPath);
        }
        appendOutputPathToLastBatch(payload.url, payload.outputPath);
      }
      const starts: { id: string; url: string; resume: boolean }[] = [];
      const skippedIds: string[] = [];
      let finishedUrl: string | undefined;
      const heroUrlBeforeFinish = get().url.trim();

      set((s) => {
        const finishedJob = s.downloadJobs.find((j) => j.id === payload.jobId);
        finishedUrl =
          payload.url?.trim() || finishedJob?.url?.trim() || undefined;

        let downloadJobs = s.downloadJobs.map((j) =>
          j.id === payload.jobId
            ? {
                ...j,
                status: payload.success
                  ? ("completed" as const)
                  : payload.timedOut
                    ? ("timed_out" as const)
                    : ("failed" as const),
                error: payload.error ?? null,
                progress: payload.success ? j.progress : j.progress,
                resumeOnStart: false,
              }
            : j,
        );

        if (payload.success) {
          downloadJobs = downloadJobs.filter(
            (j) =>
              j.id !== payload.jobId &&
              !(finishedUrl && youtubeUrlsMatch(j.url, finishedUrl)),
          );
        }

        persistDownloadJobs(downloadJobs);

        const {
          jobs: promotedJobs,
          starts: batchStarts,
          skippedIds: batchSkipped,
        } = promoteEligibleJobs(downloadJobs, s.maxConcurrentDownloads, get);
        downloadJobs = promotedJobs;
        starts.push(...batchStarts);
        skippedIds.push(...batchSkipped);
        persistDownloadJobs(downloadJobs);

        const focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);

        return {
          downloadJobs,
          focusedJobId: focus,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
          ...(payload.success ? heroClearPatchForUrl(s, finishedUrl) : {}),
        };
      });

      for (const id of skippedIds) {
        scheduleSkippedJobRemoval(get, id);
      }
      if (payload.timedOut) {
        scheduleTimedOutJobRemoval(get, payload.jobId);
      }
      for (const st of starts) {
        startHydratedDownloadJob(st.id, st.url, st.resume);
      }

      if (finishedUrl) {
        evictDownloadJobMetadataCacheWhenIdle(
          finishedUrl,
          get().downloadJobs,
          heroUrlBeforeFinish || get().url,
        );
      }

      if (payload.success) {
        void get().invalidateEntries({ silent: true });
        void deliverUserNotification(
          {
            dedupeKey: `download-finished:${payload.jobId}`,
            body: "Download finished. Your file is ready.",
            inAppBody: "Complete",
            kind: "info",
          },
          (message, type) => get().notify(message, type),
        );
        void get().refreshStorageStats();
        const jobs = get().downloadJobs;
        const busy = jobs.some(
          (j) => j.status === "queued" || j.status === "downloading",
        );
        if (!busy) get().setActiveTab("media");
      } else if (payload.timedOut) {
        void deliverUserNotification(
          {
            dedupeKey: `download-timed-out:${payload.jobId}`,
            body: DOWNLOAD_TIMED_OUT_MESSAGE,
            kind: "warning",
          },
          (message, type) => get().notify(message, type),
        );
      } else {
        const line = (payload.error ?? "Download failed").split("\n")[0];
        void deliverUserNotification(
          {
            dedupeKey: `download-failed:${payload.jobId}`,
            body: `Failed: ${line}`,
            kind: "error",
          },
          (message, type) => get().notify(message, type),
        );
      }
    },

    pumpDownloadQueue: () => {
      void (async () => {
        await ensureEntriesForDuplicateCheck(get);

        const starts: { id: string; url: string; resume: boolean }[] = [];
        const skippedIds: string[] = [];

        set((s) => {
          const {
            jobs: downloadJobs,
            starts: batchStarts,
            skippedIds: batchSkipped,
          } = promoteEligibleJobs(s.downloadJobs, s.maxConcurrentDownloads, get);
          starts.push(...batchStarts);
          skippedIds.push(...batchSkipped);

          if (batchStarts.length === 0 && batchSkipped.length === 0) {
            const focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);
            return {
              downloadJobs,
              focusedJobId: focus,
              ...syncLegacyDownloaderUi(downloadJobs, focus),
            };
          }

          persistDownloadJobs(downloadJobs);
          const focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);
          return {
            downloadJobs,
            focusedJobId: focus,
            ...syncLegacyDownloaderUi(downloadJobs, focus),
          };
        });

        for (const id of skippedIds) {
          scheduleSkippedJobRemoval(get, id);
        }
        const startDelayMs = get().settings.downloadJobStartDelayMs ?? 0;
        for (let i = 0; i < starts.length; i++) {
          if (i > 0 && startDelayMs > 0) {
            await new Promise<void>((r) => setTimeout(r, startDelayMs));
          }
          startHydratedDownloadJob(starts[i].id, starts[i].url, starts[i].resume);
        }
      })();
    },
  };
};

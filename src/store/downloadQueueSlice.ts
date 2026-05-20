import { invoke } from "@tauri-apps/api/core";
import type { StateCreator, StoreApi } from "zustand";
import { fetchVideoInfoWithTimeout } from "../downloadVideoInfoFetch";
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
  patchDownloadJobOptionsForAudio,
  persistDownloadJobs,
  toInvokeDownloadOptions,
  videoInfoToDownloadJobSnapshot,
  type DownloadJob,
  type DownloadJobApproval,
  type DownloadJobFinishedPayload,
  type DownloadJobMediaSnapshot,
  type DownloadJobOptions,
  DEFAULT_MAX_CONCURRENT_DOWNLOADS,
} from "../downloadQueue";
import type { ProgressPayload } from "../types";
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
  evictDownloadJobMetadataCacheIfOrphaned,
  evictDownloadJobMetadataCacheWhenIdle,
  peekDownloadJobMetadataCache,
} from "../downloadQueueMetadataCache";
import { deliverUserNotification } from "../systemNotify";
import { findLibraryDuplicate } from "../duplicateDownload";
import { youtubeUrlsMatch } from "../youtubeUrl";

/** Coalesce `persistDownloadJobs` when many hydrates finish back-to-back (e.g. startup sweep). */
const DOWNLOAD_JOB_HYDRATE_PERSIST_DEBOUNCE_MS = 75;
let hydratePersistTimeout: ReturnType<typeof setTimeout> | null = null;

const skippedJobRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

    const info = await fetchVideoInfoWithTimeout(urlTrim, videoFormat, audioOnly);
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
  if (prevFocus) {
    const j = jobs.find((x) => x.id === prevFocus);
    if (j && j.status !== "completed" && j.status !== "failed" && j.status !== "skipped") {
      return prevFocus;
    }
  }
  const firstDl = jobs.find((x) => x.status === "downloading");
  return firstDl?.id ?? null;
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

  enqueueDownload: (
    url: string,
    options: DownloadJobOptions,
    meta?: {
      snapshot?: DownloadJobMediaSnapshot;
      title?: string;
      approval?: DownloadJobApproval;
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
  applyDownloadProgress: (payload: ProgressPayload) => void;
  onDownloadJobFinished: (payload: DownloadJobFinishedPayload) => void;
  onDownloadJobPaused: (jobId: string) => void;
  pumpDownloadQueue: () => void;
};

export const createDownloadQueueSlice: StateCreator<
  RuforgeStore,
  [],
  [],
  DownloadQueueSlice
> = (set, get) => {
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
        if (!job || job.status !== "downloading") return;
        if (await trySkipLibraryDuplicateJob(get, jobId, url)) {
          get().pumpDownloadQueue();
          return;
        }
        await invoke("start_download_job", {
          jobId,
          url,
          options: toInvokeDownloadOptions(job.options),
          resume,
        });
      } catch (e) {
        const msg = String(e);
        if (isYtDlpStartCancelledError(msg)) {
          if (await trySkipLibraryDuplicateJob(get, jobId, url)) {
            get().pumpDownloadQueue();
            return;
          }
        }
        get().onDownloadJobFinished({
          jobId,
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
      jobs = jobs.map((j) =>
        j.id === next.id
          ? {
              ...j,
              status: "downloading" as const,
              error: null,
              resumeOnStart: false,
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
      for (const j of get().downloadJobs) {
        if (
          (j.status === "queued" || j.status === "paused") &&
          downloadJobMediaNeedsHydration(j.metadata)
        ) {
          void hydrateDownloadJobMetadata(get, set, j.id, j.url);
        }
      }
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
            };
          });
          downloadJobs = collapseDownloadJobsByUrl(downloadJobs);
          persistDownloadJobs(downloadJobs);
          return { downloadJobs };
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
      };
      set((s) => {
        const downloadJobs = collapseDownloadJobsByUrl([...s.downloadJobs, job]);
        persistDownloadJobs(downloadJobs);
        return { downloadJobs };
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

      if (job.status === "downloading") {
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
        try {
          await invoke("pause_download_job", { jobId: id });
        } catch (e) {
          console.error("[RuForge] pause_download_job failed", e);
        }
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

      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) =>
          j.id === id
            ? {
                ...j,
                status: (atCapacity ? "queued" : "downloading") as DownloadJob["status"],
                approval: "auto" as const,
                error: null,
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
        if (!latest || latest.status !== "downloading") return;
        if (await trySkipLibraryDuplicateJob(get, id, job.url)) {
          get().pumpDownloadQueue();
          return;
        }
        await invoke("start_download_job", {
          jobId: id,
          url: job.url,
          options: toInvokeDownloadOptions(job.options),
          resume: true,
        });
      } catch (e) {
        const msg = String(e);
        if (
          isYtDlpStartCancelledError(msg) &&
          (await trySkipLibraryDuplicateJob(get, id, job.url))
        ) {
          get().pumpDownloadQueue();
          return;
        }
        get().onDownloadJobFinished({ jobId: id, success: false, error: msg });
      }
    },

    retryDownloadJob: (id) => {
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
      clearSkippedJobRemovalTimer(id);
      const removedUrl = job.url;
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
        };
      });
      evictDownloadJobMetadataCacheIfOrphaned(removedUrl, get().downloadJobs);
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

    applyDownloadProgress: (payload) => {
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) => {
          if (
            j.id !== payload.jobId ||
            j.status === "completed" ||
            j.status === "failed"
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
        const focus = s.focusedJobId;
        return {
          downloadJobs,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
        };
      });
    },

    onDownloadJobPaused: (jobId) => {
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
      resetDownloadProgressEtaSmoothing(payload.jobId);
      const starts: { id: string; url: string; resume: boolean }[] = [];
      const skippedIds: string[] = [];
      const finishedUrl = get().downloadJobs.find((j) => j.id === payload.jobId)?.url;

      set((s) => {
        let downloadJobs = s.downloadJobs.map((j) =>
          j.id === payload.jobId
            ? {
                ...j,
                status: payload.success ? ("completed" as const) : ("failed" as const),
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
        };
      });

      for (const id of skippedIds) {
        scheduleSkippedJobRemoval(get, id);
      }
      for (const st of starts) {
        startHydratedDownloadJob(st.id, st.url, st.resume);
      }

      if (finishedUrl) {
        evictDownloadJobMetadataCacheWhenIdle(finishedUrl, get().downloadJobs);
      }

      if (payload.success) {
        if (finishedUrl) {
          const heroUrl = get().url.trim();
          if (heroUrl && youtubeUrlsMatch(heroUrl, finishedUrl)) {
            get().setDownloaderUrl("");
            get().setVideoInfo(null);
            get().setMetadataError(null);
          }
        }
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
        for (const st of starts) {
          startHydratedDownloadJob(st.id, st.url, st.resume);
        }
      })();
    },
  };
};

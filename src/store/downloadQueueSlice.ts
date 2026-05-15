import { invoke } from "@tauri-apps/api/core";
import type { StateCreator, StoreApi } from "zustand";
import {
  createDownloadJobId,
  downloadJobMediaNeedsHydration,
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
import type { ProgressPayload, VideoInfo } from "../types";
import type { RuforgeStore } from "./ruforgeStore";
import { normalizeYouTubeUrlForCompare } from "../youtubeUrl";
import {
  commitDownloadJobMetadataCache,
  evictDownloadJobMetadataCacheIfOrphaned,
  peekDownloadJobMetadataCache,
} from "../downloadQueueMetadataCache";

/** One in-flight `get_video_info` per normalized URL (dedupes parallel hydrates). */
const inflightMetaByKey = new Map<string, Promise<DownloadJobMediaSnapshot>>();

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
    persistDownloadJobs(get().downloadJobs);
  };

  const urlTrim = url.trim();
  const cacheKey = normalizeYouTubeUrlForCompare(urlTrim);

  const cached = peekDownloadJobMetadataCache(urlTrim);
  if (cached) {
    applySnapshot(cached);
    return;
  }

  let p = inflightMetaByKey.get(cacheKey);
  if (!p) {
    p = (async (): Promise<DownloadJobMediaSnapshot> => {
      const info = await invoke<VideoInfo>("get_video_info", { url: urlTrim });
      const snap = videoInfoToDownloadJobSnapshot(info);
      commitDownloadJobMetadataCache(cacheKey, snap);
      return snap;
    })();
    inflightMetaByKey.set(cacheKey, p);
    void p.finally(() => {
      inflightMetaByKey.delete(cacheKey);
    });
  }

  try {
    const snap = await p;
    applySnapshot(snap);
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
      uploader: cur.metadata?.uploader,
      channel: cur.metadata?.channel,
    };
    applySnapshot(snapshot);
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
    if (j && j.status !== "completed" && j.status !== "failed") {
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
  reorderDownloadJobs: (fromIndex: number, toIndex: number) => void;
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
        await hydrateDownloadJobMetadata(get, set, jobId, url);
        const job = get().downloadJobs.find((j) => j.id === jobId);
        if (!job || job.status !== "downloading") return;
        await invoke("start_download_job", {
          jobId,
          url,
          options: toInvokeDownloadOptions(job.options),
          resume,
        });
      } catch (e) {
        get().onDownloadJobFinished({
          jobId,
          success: false,
          error: String(e),
        });
      }
    })();
  }

  /** Promote queued+auto jobs until at capacity; returns jobs to start (hydrate+invoke). */
  function promoteEligibleJobs(
    downloadJobs: DownloadJob[],
    max: number,
  ): { jobs: DownloadJob[]; starts: { id: string; url: string; resume: boolean }[] } {
    let jobs = downloadJobs;
    const starts: { id: string; url: string; resume: boolean }[] = [];
    let running = jobs.filter((j) => j.status === "downloading").length;

    while (running < max) {
      const next = jobs.find(
        (j) => j.status === "queued" && j.approval === "auto",
      );
      if (!next) break;
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
    return { jobs, starts };
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
      const id = createDownloadJobId();
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
      const approval: DownloadJobApproval = meta?.approval ?? "auto";
      const job: DownloadJob = {
        id,
        url,
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
        const downloadJobs = [...s.downloadJobs, job];
        persistDownloadJobs(downloadJobs);
        return { downloadJobs };
      });
      if (downloadJobMediaNeedsHydration(job.metadata)) {
        void hydrateDownloadJobMetadata(get, set, id, url);
      }
      return id;
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
        await hydrateDownloadJobMetadata(get, set, id, job.url);
        const latest = get().downloadJobs.find((j) => j.id === id);
        if (!latest || latest.status !== "downloading") return;
        await invoke("start_download_job", {
          jobId: id,
          url: job.url,
          options: toInvokeDownloadOptions(job.options),
          resume: true,
        });
      } catch (e) {
        const msg = String(e);
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

    applyDownloadProgress: (payload) => {
      set((s) => {
        const downloadJobs = s.downloadJobs.map((j) =>
          j.id === payload.jobId ? { ...j, progress: payload } : j,
        );
        const focus = s.focusedJobId;
        return {
          downloadJobs,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
        };
      });
    },

    onDownloadJobPaused: (jobId) => {
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
      const starts: { id: string; url: string; resume: boolean }[] = [];

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
        persistDownloadJobs(downloadJobs);

        const { jobs: promotedJobs, starts: batchStarts } = promoteEligibleJobs(
          downloadJobs,
          s.maxConcurrentDownloads,
        );
        downloadJobs = promotedJobs;
        starts.push(...batchStarts);
        persistDownloadJobs(downloadJobs);

        let focus = resolveFocusAfterMutation(downloadJobs, s.focusedJobId);

        return {
          downloadJobs,
          focusedJobId: focus,
          ...syncLegacyDownloaderUi(downloadJobs, focus),
        };
      });

      for (const st of starts) {
        startHydratedDownloadJob(st.id, st.url, st.resume);
      }
    },

    pumpDownloadQueue: () => {
      const starts: { id: string; url: string; resume: boolean }[] = [];

      set((s) => {
        const { jobs: downloadJobs, starts: batchStarts } = promoteEligibleJobs(
          s.downloadJobs,
          s.maxConcurrentDownloads,
        );
        starts.push(...batchStarts);

        if (batchStarts.length === 0) {
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

      for (const st of starts) {
        startHydratedDownloadJob(st.id, st.url, st.resume);
      }
    },
  };
};

import { invoke } from "@tauri-apps/api/core";
import type { StateCreator } from "zustand";
import {
  createDownloadJobId,
  persistDownloadJobs,
  toInvokeDownloadOptions,
  type DownloadJob,
  type DownloadJobFinishedPayload,
  type DownloadJobOptions,
  DEFAULT_MAX_CONCURRENT_DOWNLOADS,
} from "../downloadQueue";
import type { ProgressPayload } from "../types";
import type { RuforgeStore } from "./ruforgeStore";
function syncLegacyDownloaderUi(
  jobs: DownloadJob[],
  activeDownloadJobId: string | null,
): {
  downloading: boolean;
  progress: ProgressPayload | null;
  activeDownloadJobId: string | null;
} {
  const active =
    activeDownloadJobId != null
      ? jobs.find((j) => j.id === activeDownloadJobId)
      : jobs.find((j) => j.status === "downloading");
  if (!active || active.status !== "downloading") {
    return { downloading: false, progress: null, activeDownloadJobId: null };
  }
  return {
    downloading: true,
    progress: active.progress,
    activeDownloadJobId: active.id,
  };
}

export type DownloadQueueSlice = {
  downloadJobs: DownloadJob[];
  maxConcurrentDownloads: number;
  activeDownloadJobId: string | null;

  enqueueDownload: (
    url: string,
    options: DownloadJobOptions,
    meta?: { title?: string },
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
> = (set, get) => ({
  downloadJobs: [],
  maxConcurrentDownloads: DEFAULT_MAX_CONCURRENT_DOWNLOADS,
  activeDownloadJobId: null,

  enqueueDownload: (url, options, meta) => {
    const id = createDownloadJobId();
    const job: DownloadJob = {
      id,
      url,
      title: meta?.title,
      status: "queued",
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
    get().pumpDownloadQueue();
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
                resumeOnStart: true,
                progress: j.progress,
              }
            : j,
        );
        persistDownloadJobs(downloadJobs);
        return {
          downloadJobs,
          ...syncLegacyDownloaderUi(downloadJobs, null),
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
          j.id === id ? { ...j, status: "paused" as const, resumeOnStart: true } : j,
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
              error: null,
              resumeOnStart: true,
            }
          : j,
      );
      persistDownloadJobs(downloadJobs);
      return {
        downloadJobs,
        ...syncLegacyDownloaderUi(
          downloadJobs,
          atCapacity ? s.activeDownloadJobId : id,
        ),
      };
    });

    if (atCapacity) {
      get().pumpDownloadQueue();
      return;
    }

    try {
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
    if (job.status === "downloading") {
      await get().pauseDownloadJob(id);
    }
    set((s) => {
      const downloadJobs = s.downloadJobs.filter((j) => j.id !== id);
      persistDownloadJobs(downloadJobs);
      return {
        downloadJobs,
        ...syncLegacyDownloaderUi(downloadJobs, s.activeDownloadJobId),
      };
    });
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
      const legacy =
        s.activeDownloadJobId === payload.jobId ||
        downloadJobs.some(
          (j) => j.id === payload.jobId && j.status === "downloading",
        )
          ? {
              downloading: true,
              progress: payload,
              activeDownloadJobId: payload.jobId,
            }
          : syncLegacyDownloaderUi(downloadJobs, s.activeDownloadJobId);
      return { downloadJobs, ...legacy };
    });
  },

  onDownloadJobPaused: (jobId) => {
    set((s) => {
      const downloadJobs = s.downloadJobs.map((j) =>
        j.id === jobId && j.status !== "paused"
          ? { ...j, status: "paused" as const, resumeOnStart: true }
          : j,
      );
      persistDownloadJobs(downloadJobs);
      return {
        downloadJobs,
        ...syncLegacyDownloaderUi(downloadJobs, null),
      };
    });
    get().pumpDownloadQueue();
  },

  onDownloadJobFinished: (payload) => {
    set((s) => {
      const downloadJobs = s.downloadJobs.map((j) =>
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
      return {
        downloadJobs,
        ...syncLegacyDownloaderUi(downloadJobs, null),
      };
    });
    get().pumpDownloadQueue();
  },

  pumpDownloadQueue: () => {
    const state = get();
    const running = state.downloadJobs.filter(
      (j) => j.status === "downloading",
    ).length;
    if (running >= state.maxConcurrentDownloads) return;

    const next = state.downloadJobs.find((j) => j.status === "queued");
    if (!next) {
      set((s) => ({
        ...syncLegacyDownloaderUi(s.downloadJobs, s.activeDownloadJobId),
      }));
      return;
    }

    const resume = Boolean(next.resumeOnStart);
    set((s) => {
      const downloadJobs = s.downloadJobs.map((j) =>
        j.id === next.id
          ? {
              ...j,
              status: "downloading" as const,
              error: null,
              resumeOnStart: false,
            }
          : j,
      );
      persistDownloadJobs(downloadJobs);
      return {
        downloadJobs,
        ...syncLegacyDownloaderUi(downloadJobs, next.id),
      };
    });

    void (async () => {
      try {
        await invoke("start_download_job", {
          jobId: next.id,
          url: next.url,
          options: toInvokeDownloadOptions(next.options),
          resume,
        });
      } catch (e) {
        get().onDownloadJobFinished({
          jobId: next.id,
          success: false,
          error: String(e),
        });
      }
    })();
  },
});

import { downloadJobDisplayFileSizeBytes } from "../downloadJobFileSizes";
import type { DownloadJob } from "../downloadQueue";
import { formatEtaSeconds } from "../downloadProgress";
import type { RuforgeStore } from "../store/ruforgeStore";
import type { ProgressPayload } from "../types";
import {
  DEV_SIMULATE_PROCESSING_MS,
  getDevSimulateDownloadMs,
  rollDevSimulateDownloadMs,
} from "./devLastDownloadBatch";

const TICK_MS = 100;
const FALLBACK_TOTAL_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_PHASE_RATIO = 0.85;

function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3);
}

function formatFakeSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 B/s";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KiB/s`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MiB/s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isActiveDownloadingJob(get: () => RuforgeStore, jobId: string): boolean {
  const job = get().downloadJobs.find((j) => j.id === jobId);
  return job?.status === "downloading";
}

function resolveTotalBytes(job: DownloadJob): number {
  const audioOnly = job.options.audioOnly === true;
  const fromMeta = downloadJobDisplayFileSizeBytes(job.metadata, audioOnly);
  return fromMeta != null && fromMeta > 0 ? fromMeta : FALLBACK_TOTAL_BYTES;
}

function resolvePlaylistProgressExtras(
  get: () => RuforgeStore,
  job: DownloadJob,
): Pick<ProgressPayload, "currentIndex" | "totalItems"> {
  const playlistIndex = job.options.playlistIndex;
  if (playlistIndex == null || playlistIndex < 1) return {};

  const folder = job.options.playlistOutputFolder?.trim();
  const st = get();
  let totalItems = st.videoInfo?.playlistItems?.length ?? 0;

  if (folder) {
    const cohort = st.downloadJobs.filter(
      (j) =>
        j.options.playlistOutputFolder === folder &&
        j.status !== "completed" &&
        j.status !== "failed" &&
        j.status !== "skipped" &&
        j.status !== "timed_out",
    );
    if (cohort.length > 0) totalItems = cohort.length;
  }

  if (totalItems <= 0) totalItems = 1;
  return {
    currentIndex: playlistIndex - 1,
    totalItems,
  };
}

function buildProgressPayload(
  get: () => RuforgeStore,
  job: DownloadJob,
  percentage: number,
  status: ProgressPayload["status"],
  totalBytes: number,
  downloadPhaseMs: number,
  elapsedMs: number,
): ProgressPayload {
  const downloadedBytes = Math.min(
    totalBytes,
    Math.round((totalBytes * percentage) / 100),
  );
  const remainingSec = Math.max(
    0,
    ((downloadPhaseMs - elapsedMs) / 1000) * (1 - percentage / 100),
  );
  const speedBps =
    elapsedMs > 0 ? (downloadedBytes / elapsedMs) * 1000 : totalBytes / (downloadPhaseMs / 1000);

  return {
    jobId: job.id,
    percentage,
    speed: formatFakeSpeed(speedBps),
    eta: formatEtaSeconds(remainingSec),
    status,
    downloadedBytes,
    totalBytes,
    ...resolvePlaylistProgressExtras(get, job),
  };
}

export async function runDevSimulatedDownload(
  get: () => RuforgeStore,
  jobId: string,
  url: string,
): Promise<void> {
  const totalWallMs = getDevSimulateDownloadMs() ?? rollDevSimulateDownloadMs();
  const downloadPhaseMs = Math.round(totalWallMs * DOWNLOAD_PHASE_RATIO);
  const processingMs = DEV_SIMULATE_PROCESSING_MS;

  const job = get().downloadJobs.find((j) => j.id === jobId);
  if (!job || job.status !== "downloading") return;

  const totalBytes = resolveTotalBytes(job);
  const startedAt = Date.now();

  while (true) {
    if (!isActiveDownloadingJob(get, jobId)) return;

    const elapsed = Date.now() - startedAt;
    if (elapsed >= downloadPhaseMs) break;

    const t = downloadPhaseMs > 0 ? elapsed / downloadPhaseMs : 1;
    const percentage = easeOutCubic(t) * 98;
    const curJob = get().downloadJobs.find((j) => j.id === jobId);
    if (!curJob) return;

    get().applyDownloadProgress(
      buildProgressPayload(
        get,
        curJob,
        percentage,
        "downloading",
        totalBytes,
        downloadPhaseMs,
        elapsed,
      ),
    );

    await sleep(TICK_MS);
  }

  if (!isActiveDownloadingJob(get, jobId)) return;

  const curJob = get().downloadJobs.find((j) => j.id === jobId);
  if (!curJob) return;

  get().applyDownloadProgress(
    buildProgressPayload(
      get,
      curJob,
      98,
      "downloading",
      totalBytes,
      downloadPhaseMs,
      downloadPhaseMs,
    ),
  );

  const processingStarted = Date.now();
  while (Date.now() - processingStarted < processingMs) {
    if (!isActiveDownloadingJob(get, jobId)) return;

    const procJob = get().downloadJobs.find((j) => j.id === jobId);
    if (!procJob) return;

    get().applyDownloadProgress(
      buildProgressPayload(
        get,
        procJob,
        100,
        "processing",
        totalBytes,
        downloadPhaseMs,
        downloadPhaseMs,
      ),
    );

    await sleep(TICK_MS);
  }

  if (!isActiveDownloadingJob(get, jobId)) return;

  get().onDownloadJobFinished({
    jobId,
    url,
    success: true,
  });
}

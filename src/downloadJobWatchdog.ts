import { jobHasDownloadTransferStarted, type DownloadJob } from "./downloadQueue";
import { parseYtdlpEtaToSeconds } from "./downloadProgress";
import type { RuforgeStore } from "./store/ruforgeStore";
import type { ProgressPayload } from "./types";

/** Ignore duplicate yt-dlp lines (0% spinners, repeated %) that reset the idle clock. */
export function progressAdvancesDownloadWatchdog(
  prev: ProgressPayload | null,
  next: ProgressPayload,
): boolean {
  if (!prev) {
    if (next.status === "processing") return true;
    return typeof next.percentage === "number" && next.percentage > 0;
  }
  if (next.status === "processing" && prev.status !== "processing") return true;

  const prevBytes = prev.downloadedBytes ?? 0;
  const nextBytes = next.downloadedBytes ?? 0;
  if (nextBytes > prevBytes) return true;

  const prevPct = prev.percentage ?? 0;
  const nextPct = next.percentage ?? 0;
  if (nextPct > prevPct + 0.05) return true;

  return false;
}

/** No yt-dlp transfer bytes yet (inspect + connect + first stdout). Aligns with Rust SUBPROCESS_OUTPUT_TIMEOUT_SECS. */
const PRE_TRANSFER_MAX_MS = 90_000;
const MIN_ACTIVE_IDLE_MS = 5 * 60_000;
const MAX_ACTIVE_IDLE_MS = 45 * 60_000;
const PROCESSING_IDLE_MS = 10 * 60_000;
const PROCESSING_LARGE_IDLE_MS = 25 * 60_000;
const AUDIO_PROCESSING_IDLE_MS = 45_000;
const AUDIO_ACTIVE_IDLE_MS = 45_000;
const AUDIO_ACTIVE_IDLE_MAX_MS = 90_000;
const LARGE_BYTES = 1_000_000_000;

/** Hard cap from when status becomes downloading (auto-save audio should finish well under this). */
export const MAX_DOWNLOAD_WALL_CLOCK_MS = 2 * 60_000;

type WatchEntry = {
  lastActivityMs: number;
  generation: number;
};

const entries = new Map<string, WatchEntry>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let generationSeq = 0;

let storeGet: (() => RuforgeStore) | null = null;
let onStall: ((jobId: string) => void) | null = null;
let onTimeout: ((jobId: string) => void) | null = null;
let foregroundBound = false;

export function initDownloadJobWatchdog(
  get: () => RuforgeStore,
  stallHandler: (jobId: string) => void,
  timeoutHandler: (jobId: string) => void,
): void {
  storeGet = get;
  onStall = stallHandler;
  onTimeout = timeoutHandler;
  queueMicrotask(() => syncDownloadJobWatchdogsFromStore());
  bindDownloadWatchdogForegroundRecovery();
}

function readStoreJobs(): DownloadJob[] {
  return storeGet?.()?.downloadJobs ?? [];
}

/** Re-arm timers after Vite HMR or module reload left jobs stuck in downloading. */
export function syncDownloadJobWatchdogsFromStore(): void {
  const jobs = readStoreJobs();
  for (const job of jobs) {
    if (job.status === "downloading") {
      armDownloadJobWatchdog(job.id);
    }
  }
}

function bindDownloadWatchdogForegroundRecovery(): void {
  if (foregroundBound || typeof document === "undefined") return;
  foregroundBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    syncDownloadJobWatchdogsFromStore();
    void evaluateAllDownloadingJobsNow();
  });
}

function jobWallClockAgeMs(job: DownloadJob): number {
  const started =
    typeof job.downloadingSince === "number" && job.downloadingSince > 0
      ? job.downloadingSince
      : typeof job.createdAt === "number" && job.createdAt > 0
        ? job.createdAt
        : Date.now();
  return Date.now() - started;
}

function jobExceededWallClock(job: DownloadJob): boolean {
  if (job.options?.audioOnly !== true) return false;
  return jobWallClockAgeMs(job) >= MAX_DOWNLOAD_WALL_CLOCK_MS;
}

async function evaluateAllDownloadingJobsNow(): Promise<void> {
  const jobs = readStoreJobs();
  for (const job of jobs) {
    if (job.status !== "downloading") continue;
    const entry = entries.get(job.id);
    if (!entry) {
      armDownloadJobWatchdog(job.id);
      continue;
    }
    await evaluateStall(job.id, entry.generation);
  }
}

/** Idle budget before treating a downloading job as stalled (not a global poll interval). */
export function computeDownloadJobStallThresholdMs(job: DownloadJob): number {
  const audioOnly = job.options?.audioOnly === true;

  if (!jobHasDownloadTransferStarted(job)) {
    return PRE_TRANSFER_MAX_MS;
  }

  const p = job.progress;
  if (!p) {
    return PRE_TRANSFER_MAX_MS;
  }

  if (p.status === "processing") {
    if (audioOnly) {
      return AUDIO_PROCESSING_IDLE_MS;
    }
    const total =
      (typeof p.totalBytes === "number" && p.totalBytes > 0 ? p.totalBytes : null) ??
      job.metadata?.fileSizeBytes ??
      job.metadata?.fileSizeBytesVideo ??
      null;
    if (typeof total === "number" && total >= LARGE_BYTES) {
      return PROCESSING_LARGE_IDLE_MS;
    }
    return PROCESSING_IDLE_MS;
  }

  const pct =
    typeof p.percentage === "number" && Number.isFinite(p.percentage)
      ? Math.max(0, Math.min(100, p.percentage))
      : 0;

  if (audioOnly) {
    const etaSec = parseYtdlpEtaToSeconds(p.eta ?? "");
    if (etaSec != null && etaSec > 0) {
      const fromEta = (etaSec * 2 + 20) * 1000;
      return Math.min(Math.max(fromEta, 45_000), AUDIO_ACTIVE_IDLE_MAX_MS);
    }
    if (pct >= 99) return 45_000;
    if (pct >= 90) return 60_000;
    return AUDIO_ACTIVE_IDLE_MS;
  }

  const etaSec = parseYtdlpEtaToSeconds(p.eta ?? "");
  if (etaSec != null && etaSec > 0) {
    const fromEta = (etaSec * 2.5 + 120) * 1000;
    return Math.min(Math.max(fromEta, MIN_ACTIVE_IDLE_MS), MAX_ACTIVE_IDLE_MS);
  }

  if (pct >= 99) return 6 * 60_000;
  if (pct >= 90) return 8 * 60_000;
  if (pct >= 50) return 12 * 60_000;
  return 18 * 60_000;
}

function nextGeneration(): number {
  generationSeq += 1;
  return generationSeq;
}

function scheduleCheck(jobId: string, generation: number, delayMs: number): void {
  const prev = timers.get(jobId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    void evaluateStall(jobId, generation);
  }, Math.max(1000, delayMs));
  timers.set(jobId, timer);
}

function resolveJob(jobId: string): DownloadJob | undefined {
  return readStoreJobs().find((j) => j.id === jobId);
}

async function evaluateStall(jobId: string, generation: number): Promise<void> {
  const entry = entries.get(jobId);
  if (!entry || entry.generation !== generation) return;

  const job = resolveJob(jobId);
  if (!job || job.status !== "downloading") {
    disarmDownloadJobWatchdog(jobId);
    return;
  }

  if (jobExceededWallClock(job)) {
    disarmDownloadJobWatchdog(jobId);
    onTimeout?.(jobId);
    return;
  }

  const now = Date.now();
  const idleMs = now - entry.lastActivityMs;
  const threshold = computeDownloadJobStallThresholdMs(job);

  if (idleMs >= threshold) {
    disarmDownloadJobWatchdog(jobId);
    const audioOnly = job.options?.audioOnly === true;
    if (!jobHasDownloadTransferStarted(job) || audioOnly) {
      onTimeout?.(jobId);
    } else {
      onStall?.(jobId);
    }
    return;
  }

  scheduleCheck(
    jobId,
    generation,
    Math.max(
      1000,
      job.options?.audioOnly === true
        ? Math.min(threshold - idleMs, MAX_DOWNLOAD_WALL_CLOCK_MS - jobWallClockAgeMs(job))
        : threshold - idleMs,
    ),
  );
}

function scheduleWatchdogCheck(jobId: string, generation: number, job: DownloadJob | undefined): void {
  const idleDelay = job ? computeDownloadJobStallThresholdMs(job) : PRE_TRANSFER_MAX_MS;
  const wallRemaining =
    job != null && job.options?.audioOnly === true
      ? MAX_DOWNLOAD_WALL_CLOCK_MS - jobWallClockAgeMs(job)
      : Number.POSITIVE_INFINITY;
  scheduleCheck(jobId, generation, Math.max(1000, Math.min(idleDelay, wallRemaining)));
}

function touchEntry(jobId: string): WatchEntry {
  const now = Date.now();
  let entry = entries.get(jobId);
  if (!entry) {
    entry = { lastActivityMs: now, generation: nextGeneration() };
    entries.set(jobId, entry);
    return entry;
  }
  entry.lastActivityMs = now;
  return entry;
}

/** Start or refresh idle tracking for a downloading job. */
export function armDownloadJobWatchdog(jobId: string): void {
  const entry = touchEntry(jobId);
  const job = resolveJob(jobId);
  if (job?.status === "downloading" && jobExceededWallClock(job)) {
    disarmDownloadJobWatchdog(jobId);
    onTimeout?.(jobId);
    return;
  }
  scheduleWatchdogCheck(jobId, entry.generation, job);
}

/** Reset the idle window after progress IPC (or other meaningful activity). */
export function touchDownloadJobWatchdog(jobId: string): void {
  const entry = touchEntry(jobId);
  const job = resolveJob(jobId);
  scheduleWatchdogCheck(jobId, entry.generation, job);
}

export function disarmDownloadJobWatchdog(jobId: string): void {
  const t = timers.get(jobId);
  if (t) clearTimeout(t);
  timers.delete(jobId);
  const entry = entries.get(jobId);
  if (entry) {
    entry.generation = nextGeneration();
    entries.delete(jobId);
  }
}

export function disarmAllDownloadJobWatchdogs(): void {
  for (const jobId of [...timers.keys()]) {
    disarmDownloadJobWatchdog(jobId);
  }
}

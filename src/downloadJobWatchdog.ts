import { jobHasDownloadTransferStarted, type DownloadJob } from "./downloadQueue";
import { parseYtdlpEtaToSeconds } from "./downloadProgress";
import type { RuforgeStore } from "./store/ruforgeStore";

/** No yt-dlp progress yet: metadata hydrate + invoke + connect. */
const PRE_TRANSFER_MAX_MS = 4 * 60_000;
const MIN_ACTIVE_IDLE_MS = 5 * 60_000;
const MAX_ACTIVE_IDLE_MS = 45 * 60_000;
const PROCESSING_IDLE_MS = 10 * 60_000;
const PROCESSING_LARGE_IDLE_MS = 25 * 60_000;
const LARGE_BYTES = 1_000_000_000;

type WatchEntry = {
  lastActivityMs: number;
  generation: number;
};

const entries = new Map<string, WatchEntry>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let generationSeq = 0;

let storeGet: (() => RuforgeStore) | null = null;
let onStall: ((jobId: string) => void) | null = null;

export function initDownloadJobWatchdog(
  get: () => RuforgeStore,
  stallHandler: (jobId: string) => void,
): void {
  storeGet = get;
  onStall = stallHandler;
}

/** Idle budget before treating a downloading job as stalled (not a global poll interval). */
export function computeDownloadJobStallThresholdMs(job: DownloadJob): number {
  if (!jobHasDownloadTransferStarted(job)) {
    return PRE_TRANSFER_MAX_MS;
  }

  const p = job.progress;
  if (!p) {
    return PRE_TRANSFER_MAX_MS;
  }

  if (p.status === "processing") {
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
  return storeGet?.().downloadJobs.find((j) => j.id === jobId);
}

async function evaluateStall(jobId: string, generation: number): Promise<void> {
  const entry = entries.get(jobId);
  if (!entry || entry.generation !== generation) return;

  const job = resolveJob(jobId);
  if (!job || job.status !== "downloading") {
    disarmDownloadJobWatchdog(jobId);
    return;
  }

  const idleMs = Date.now() - entry.lastActivityMs;
  const threshold = computeDownloadJobStallThresholdMs(job);

  if (idleMs >= threshold) {
    disarmDownloadJobWatchdog(jobId);
    onStall?.(jobId);
    return;
  }

  scheduleCheck(jobId, generation, threshold - idleMs);
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
  const delay = job ? computeDownloadJobStallThresholdMs(job) : PRE_TRANSFER_MAX_MS;
  scheduleCheck(jobId, entry.generation, delay);
}

/** Reset the idle window after progress IPC (or other meaningful activity). */
export function touchDownloadJobWatchdog(jobId: string): void {
  const entry = touchEntry(jobId);
  const job = resolveJob(jobId);
  const delay = job ? computeDownloadJobStallThresholdMs(job) : PRE_TRANSFER_MAX_MS;
  scheduleCheck(jobId, entry.generation, delay);
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

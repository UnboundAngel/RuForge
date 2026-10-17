import type { ProgressPayload } from "./types";

const MAX_BYTE_SAMPLES = 10;
const MIN_BYTE_SAMPLES = 2;
const EMA_ALPHA = 0.2;
const EMA_ALPHA_FAST_CATCHUP = 0.45;
const MAX_ETA_DECREASE_PER_TICK_SEC = 4;
const MAX_ETA_DECREASE_LARGE_GAP_SEC = 15;
const MIN_DT_SEC_FOR_RATE = 0.5;

type ByteSample = { t: number; bytes: number };

type EtaSmoothState = {
  byteSamples: ByteSample[];
  emaBps: number | null;
  emaEtaSec: number | null;
  lastDisplayedEtaSec: number | null;
  rawEtaSamples: number;
};

const etaStateByJob = new Map<string, EtaSmoothState>();

function emptyEtaState(): EtaSmoothState {
  return {
    byteSamples: [],
    emaBps: null,
    emaEtaSec: null,
    lastDisplayedEtaSec: null,
    rawEtaSamples: 0,
  };
}

/** Clear smoothed ETA state when a job ends or pauses. */
export function resetDownloadProgressEtaSmoothing(jobId: string): void {
  etaStateByJob.delete(jobId);
}

/** Parse yt-dlp speed tokens (`1.23MiB/s`, `450KiB/s`, `120B/s`). */
export function parseYtdlpSpeedToBps(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === "???") return null;
  const m = /^([\d.]+)\s*([KMGT]?i?B)\/s$/i.exec(t);
  if (!m) return null;
  const num = Number.parseFloat(m[1]!);
  if (!Number.isFinite(num) || num < 0) return null;
  const unit = m[2]!.toUpperCase();
  const mult =
    unit === "B"
      ? 1
      : unit === "KB" || unit === "KIB"
        ? 1024
        : unit === "MB" || unit === "MIB"
          ? 1024 * 1024
          : unit === "GB" || unit === "GIB"
            ? 1024 * 1024 * 1024
            : unit === "TB" || unit === "TIB"
              ? 1024 * 1024 * 1024 * 1024
              : null;
  if (mult == null) return null;
  const bps = num * mult;
  return Number.isFinite(bps) && bps > 0 ? bps : null;
}

const QUALITY_HEIGHTS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 2160, label: "2160p" },
  { min: 1440, label: "1440p" },
  { min: 1080, label: "1080p" },
  { min: 720, label: "720p" },
  { min: 480, label: "480p" },
  { min: 360, label: "360p" },
];

/** Map a finished file's video height (or audio-only) to a readable quality label. */
export function qualityLabelFromHeight(
  height: number | null | undefined,
  audioOnly: boolean,
): string | undefined {
  if (audioOnly) return "audio";
  if (height == null || !Number.isFinite(height) || height <= 0) return undefined;
  for (const row of QUALITY_HEIGHTS) {
    if (height >= row.min) return row.label;
  }
  return "360p";
}

const PEAK_WARMUP_MS = 2000;
const PEAK_WINDOW_MS = 3000;
const PEAK_SAMPLE_CAP = 24;

/** Update peakBps from a progress speed sample; ignores warm-up and single-sample spikes via a ~3s window. */
export function trackDownloadPeakBps(
  job: {
    downloadingSince?: number;
    peakBps?: number;
    speedSamples?: { tMs: number; bps: number }[];
  },
  speedRaw: string,
  nowMs = Date.now(),
): Pick<typeof job, "peakBps" | "speedSamples"> {
  const bps = parseYtdlpSpeedToBps(speedRaw);
  if (bps == null) {
    return { peakBps: job.peakBps, speedSamples: job.speedSamples };
  }
  const since = job.downloadingSince;
  if (since != null && nowMs - since < PEAK_WARMUP_MS) {
    return { peakBps: job.peakBps, speedSamples: job.speedSamples };
  }
  const samples = [...(job.speedSamples ?? []), { tMs: nowMs, bps }];
  while (samples.length > PEAK_SAMPLE_CAP) samples.shift();
  const windowStart = nowMs - PEAK_WINDOW_MS;
  const inWindow = samples.filter((s) => s.tMs >= windowStart);
  if (inWindow.length < 2) {
    return { peakBps: job.peakBps, speedSamples: samples };
  }
  const avg = inWindow.reduce((sum, s) => sum + s.bps, 0) / inWindow.length;
  const peakBps = job.peakBps == null ? avg : Math.max(job.peakBps, avg);
  return { peakBps, speedSamples: samples };
}

/** Parse yt-dlp ETA tokens (`MM:SS`, `H:MM:SS`). */
export function parseYtdlpEtaToSeconds(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === "???") return null;
  const parts = t.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [m, s] = nums;
    return m * 60 + s;
  }
  const [h, m, s] = nums;
  return h * 3600 + m * 60 + s;
}

/** Format seconds like yt-dlp progress (`M:SS` or `H:MM:SS`). */
export function formatEtaSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "???";
  const total = Math.ceil(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function clampEtaDisplay(
  etaSec: number,
  state: EtaSmoothState,
  fromByteRate = false,
): number {
  if (state.lastDisplayedEtaSec == null) return etaSec;
  const prev = state.lastDisplayedEtaSec;
  if (etaSec >= prev) return etaSec;
  const gap = prev - etaSec;
  if (fromByteRate) {
    const maxDrop = Math.max(30, gap * 0.4);
    return Math.max(etaSec, prev - maxDrop);
  }
  if (gap > MAX_ETA_DECREASE_LARGE_GAP_SEC) {
    return Math.max(etaSec, prev - MAX_ETA_DECREASE_LARGE_GAP_SEC);
  }
  if (gap > MAX_ETA_DECREASE_PER_TICK_SEC) {
    return Math.max(etaSec, prev - MAX_ETA_DECREASE_PER_TICK_SEC);
  }
  return etaSec;
}

function formatSpeedFromBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "";
  const mib = bps / (1024 * 1024);
  if (mib >= 0.1) return `${mib.toFixed(2)}MiB/s`;
  const kib = bps / 1024;
  if (kib >= 0.1) return `${kib.toFixed(2)}KiB/s`;
  return `${Math.round(bps)}B/s`;
}

function applyEtaSmoothing(
  jobId: string,
  prev: ProgressPayload | null | undefined,
  merged: ProgressPayload,
  nowMs: number,
): ProgressPayload {
  let state = etaStateByJob.get(jobId);
  if (!state) {
    state = emptyEtaState();
    etaStateByJob.set(jobId, state);
  }

  const dl = merged.downloadedBytes;
  const total = merged.totalBytes;

  if (
    typeof dl === "number" &&
    typeof total === "number" &&
    total > 0 &&
    dl >= 0
  ) {
    state.byteSamples.push({ t: nowMs, bytes: dl });
    if (state.byteSamples.length > MAX_BYTE_SAMPLES) {
      state.byteSamples.shift();
    }

    if (state.byteSamples.length >= MIN_BYTE_SAMPLES) {
      const oldest = state.byteSamples[0]!;
      const newest = state.byteSamples[state.byteSamples.length - 1]!;
      const dtSec = (newest.t - oldest.t) / 1000;
      const dBytes = newest.bytes - oldest.bytes;
      if (dtSec >= MIN_DT_SEC_FOR_RATE && dBytes > 0) {
        const instantBps = dBytes / dtSec;
        const alpha =
          state.emaBps != null && instantBps > state.emaBps * 1.5
            ? EMA_ALPHA_FAST_CATCHUP
            : EMA_ALPHA;
        state.emaBps =
          state.emaBps == null
            ? instantBps
            : alpha * instantBps + (1 - alpha) * state.emaBps;
      }
    }

    const rawEtaParsed = parseYtdlpEtaToSeconds(merged.eta);
    if (rawEtaParsed != null) {
      state.rawEtaSamples += 1;
      state.emaEtaSec =
        state.emaEtaSec == null
          ? rawEtaParsed
          : EMA_ALPHA * rawEtaParsed + (1 - EMA_ALPHA) * state.emaEtaSec;
    }

    if (
      state.emaBps != null &&
      state.emaBps > 0 &&
      state.byteSamples.length >= MIN_BYTE_SAMPLES
    ) {
      const remaining = Math.max(0, total - dl);
      let etaSec = remaining / state.emaBps;
      etaSec = clampEtaDisplay(etaSec, state, true);
      state.lastDisplayedEtaSec = etaSec;
      const speed = formatSpeedFromBps(state.emaBps);
      return {
        ...merged,
        eta: formatEtaSeconds(etaSec),
        ...(speed ? { speed } : {}),
      };
    }
  }

  const parsed = parseYtdlpEtaToSeconds(merged.eta);
  if (parsed != null) {
    state.rawEtaSamples += 1;
    state.emaEtaSec =
      state.emaEtaSec == null
        ? parsed
        : EMA_ALPHA * parsed + (1 - EMA_ALPHA) * state.emaEtaSec;
    if (state.rawEtaSamples >= MIN_BYTE_SAMPLES || prev != null) {
      let etaSec = clampEtaDisplay(state.emaEtaSec, state);
      state.lastDisplayedEtaSec = etaSec;
      return { ...merged, eta: formatEtaSeconds(etaSec) };
    }
  }

  if (state.byteSamples.length < MIN_BYTE_SAMPLES && state.rawEtaSamples < MIN_BYTE_SAMPLES) {
    return { ...merged, eta: "" };
  }

  return merged;
}

/**
 * yt-dlp often reports fragment-level percentages that jump backward on HLS/DASH.
 * Keep the UI monotonic while status stays `downloading`.
 */
export function mergeDownloadProgressMonotonic(
  prev: ProgressPayload | null | undefined,
  next: ProgressPayload,
): ProgressPayload {
  if (!prev) return next;
  if (prev.status === "processing" || next.status === "processing") {
    return next;
  }
  if (prev.status !== "downloading" || next.status !== "downloading") {
    return next;
  }

  const prevPct =
    typeof prev.percentage === "number" && Number.isFinite(prev.percentage)
      ? prev.percentage
      : 0;
  const nextPct =
    typeof next.percentage === "number" && Number.isFinite(next.percentage)
      ? next.percentage
      : 0;
  const percentage = Math.max(prevPct, nextPct);

  let downloadedBytes = next.downloadedBytes;
  if (
    typeof prev.downloadedBytes === "number" &&
    typeof downloadedBytes === "number"
  ) {
    downloadedBytes = Math.max(prev.downloadedBytes, downloadedBytes);
  }

  let totalBytes = next.totalBytes;
  if (typeof prev.totalBytes === "number" && typeof totalBytes === "number") {
    totalBytes = Math.max(prev.totalBytes, totalBytes);
  } else if (typeof prev.totalBytes === "number" && totalBytes == null) {
    totalBytes = prev.totalBytes;
  }

  return {
    ...next,
    percentage,
    ...(downloadedBytes != null ? { downloadedBytes } : {}),
    ...(totalBytes != null ? { totalBytes } : {}),
  };
}

/** Monotonic merge plus per-job ETA/speed smoothing for downloader UI. */
export function mergeDownloadProgressWithSmoothing(
  jobId: string,
  prev: ProgressPayload | null | undefined,
  next: ProgressPayload,
  nowMs = Date.now(),
): ProgressPayload {
  const merged = mergeDownloadProgressMonotonic(prev, next);
  if (merged.status === "processing") {
    return merged;
  }
  if (merged.status !== "downloading") {
    return merged;
  }
  return applyEtaSmoothing(jobId, prev, merged, nowMs);
}

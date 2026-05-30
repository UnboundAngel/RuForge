import type { DuplicateDownloadChoice } from "./components/DuplicateDownloadDialog";
import { DEFAULT_FILENAME_TEMPLATE, SAVE_AS_NEW_FILENAME_TEMPLATE } from "./duplicateDownload";
import { normalizeYouTubeUrlForCompare } from "./youtubeUrl";
import {
  normalizeDownloadAudioFormat,
  ytdlpFormatFromPreferredQuality,
  ytdlpFormatFromSettings,
} from "./downloadFormat";
import { normalizeDurationSeconds } from "./components/downloader/downloaderFormat";
import type { PlaylistItem, ProgressPayload, VideoInfo } from "./types";
import type { RuforgeSettings } from "./store/types";
import { effectiveDownloadSubLangs, normalizeBrowserContext } from "./store/types";

/** Snapshot from `get_video_info` at enqueue time; drives downloader hero while this job is active. */
export interface DownloadJobMediaSnapshot {
  title: string;
  thumbnail: string;
  duration: number;
  /** Active mode display size; derived from audio/video pair when both are known. */
  fileSizeBytes?: number | null;
  fileSizeBytesAudio?: number | null;
  fileSizeBytesVideo?: number | null;
  isPlaylist: boolean;
  playlistItems?: PlaylistItem[];
  uploader?: string | null;
  channel?: string | null;
}

/** Rebuild hero `VideoInfo` from a cached job snapshot (no yt-dlp round-trip). */
export function downloadJobSnapshotToVideoInfo(snap: DownloadJobMediaSnapshot): VideoInfo {
  return {
    title: snap.title,
    thumbnail: snap.thumbnail,
    duration: normalizeDurationSeconds(snap.duration),
    formats: [],
    fileSizeBytes: snap.fileSizeBytes ?? null,
    fileSizeBytesAudio: snap.fileSizeBytesAudio ?? null,
    fileSizeBytesVideo: snap.fileSizeBytesVideo ?? null,
    isPlaylist: snap.isPlaylist,
    playlistItems: snap.playlistItems,
    uploader: snap.uploader ?? null,
    channel: snap.channel ?? null,
  };
}

export function videoInfoToDownloadJobSnapshot(
  info: VideoInfo,
  audioOnly = false,
): DownloadJobMediaSnapshot {
  const audio =
    typeof info.fileSizeBytesAudio === "number" && info.fileSizeBytesAudio > 0
      ? info.fileSizeBytesAudio
      : null;
  const video =
    typeof info.fileSizeBytesVideo === "number" && info.fileSizeBytesVideo > 0
      ? info.fileSizeBytesVideo
      : null;
  const legacy =
    typeof info.fileSizeBytes === "number" && info.fileSizeBytes > 0
      ? info.fileSizeBytes
      : null;
  const fileSizeBytesAudio = audio ?? (audioOnly ? legacy : null);
  const fileSizeBytesVideo = video ?? (!audioOnly ? legacy : null);
  const fileSizeBytes = audioOnly
    ? (fileSizeBytesAudio ?? legacy)
    : (fileSizeBytesVideo ?? legacy);
  const playlistItems = info.playlistItems?.map((item) => ({
    ...item,
    duration: normalizeDurationSeconds(item.duration),
  }));
  return {
    title: info.title,
    thumbnail: info.thumbnail ?? "",
    duration: normalizeDurationSeconds(info.duration),
    fileSizeBytes,
    fileSizeBytesAudio,
    fileSizeBytesVideo,
    isPlaylist: info.isPlaylist,
    playlistItems,
    uploader: info.uploader ?? undefined,
    channel: info.channel ?? undefined,
  };
}

/** True when activation should run a one-time `get_video_info` to fill the job row. */
export function downloadJobMediaNeedsHydration(
  m: DownloadJobMediaSnapshot | null | undefined,
): boolean {
  if (!m) return true;
  if (!String(m.title ?? "").trim()) return true;
  if (!String(m.thumbnail ?? "").trim()) return true;
  return false;
}

export type DownloadJobStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  /** Brief UI state before row removal when auto-skip duplicates is on and the file is in library. */
  | "skipped";

export const LIBRARY_DUPLICATE_SKIP_MESSAGE = "Already in library";

/** How long a duplicate-skipped row stays visible before removal. */
export const LIBRARY_DUPLICATE_SKIP_ROW_MS = 1800;

/** True once yt-dlp has reported real transfer/processing progress for this job. */
export function jobHasDownloadTransferStarted(job: DownloadJob): boolean {
  const p = job.progress;
  if (!p) return false;
  if (p.status === "processing") return true;
  return typeof p.percentage === "number" && p.percentage > 0;
}

/**
 * - **held** — queued before the user clicks Download; never promoted until released to auto.
 * - **auto** — eligible for pump (user started the batch or approved / resumed).
 * - **pending** — mid-active-batch add; needs Yes in row.
 * - **manual** — user declined or paused — never auto-starts.
 */
export type DownloadJobApproval = "held" | "auto" | "pending" | "manual";

export interface DownloadJobOptions {
  format: string;
  outputDir: string;
  filenameTemplate: string;
  browserCookies: string;
  cookieFile: string;
  subLangs: string;
  audioOnly: boolean;
  audioFormat: string;
  /** When true, Rust runs `extract_frames` after a successful video download. */
  autoScrubberPreviews: boolean;
  /** Sanitized subfolder for playlist batch jobs. */
  playlistOutputFolder?: string | null;
  /** 1-based playlist index for ordered filenames. */
  playlistIndex?: number | null;
}

export interface DownloadJob {
  id: string;
  url: string;
  title?: string;
  /** Rich metadata when known at enqueue or after activation hydrate; source of truth for active-job hero. */
  metadata?: DownloadJobMediaSnapshot | null;
  status: DownloadJobStatus;
  approval: DownloadJobApproval;
  progress: ProgressPayload | null;
  error?: string | null;
  options: DownloadJobOptions;
  createdAt: number;
  /** When true, next start uses yt-dlp `--continue` with stored cookie opts. */
  resumeOnStart?: boolean;
}

export type DownloadJobFinishedPayload = {
  jobId: string;
  success: boolean;
  error?: string;
  /** Set by Rust on IPC finish; used when the queue row was removed before this handler runs. */
  url?: string;
};

export { DEFAULT_MAX_CONCURRENT_DOWNLOADS } from "./store/types";

const SESSION_QUEUE_KEY = "ruforge-download-queue";

export function createDownloadJobId(): string {
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Fingerprint for memoizing queue list order while ignoring progress/metadata churn.
 * Multiset of `(id, createdAt)` changes on enqueue/remove; physical id tail changes on
 * `reorderDownloadJobs` so UI order stays aligned with `promoteEligibleJobs` traversal.
 */
export function downloadJobsQueueOrderFingerprint(jobs: DownloadJob[]): string {
  if (jobs.length === 0) return "";
  const multiset = jobs
    .map((j) => `${j.id}:${j.createdAt}`)
    .sort()
    .join("|");
  const physical = jobs.map((j) => j.id).join("\x1f");
  return `${multiset}\x1e${physical}`;
}

export function patchDownloadJobOptionsForAudio(
  options: DownloadJobOptions,
  audioOnly: boolean,
  settings: RuforgeSettings,
): DownloadJobOptions {
  return {
    ...options,
    audioOnly,
    format: audioOnly
      ? "bestaudio/best"
      : ytdlpFormatFromPreferredQuality(settings.preferredQuality),
    subLangs: audioOnly ? "" : effectiveDownloadSubLangs(settings),
    audioFormat: normalizeDownloadAudioFormat(settings.downloadAudioFormat),
    autoScrubberPreviews:
      !audioOnly && settings.autoDownloadScrubberPreviews !== false,
  };
}

/** Refresh subtitle/scrubber opts on queued rows when Downloads settings change. */
export function patchDownloadJobOptionsFromSettings(
  options: DownloadJobOptions,
  settings: RuforgeSettings,
): DownloadJobOptions {
  const subLangs = options.audioOnly ? "" : effectiveDownloadSubLangs(settings);
  const autoScrubberPreviews =
    !options.audioOnly && settings.autoDownloadScrubberPreviews !== false;
  if (
    options.subLangs === subLangs &&
    options.autoScrubberPreviews === autoScrubberPreviews
  ) {
    return options;
  }
  return { ...options, subLangs, autoScrubberPreviews };
}

/** Cookie context for yt-dlp metadata simulate and download (matches `DownloadOptions`). */
export function cookieContextFromSettings(
  settings: Pick<RuforgeSettings, "browserContext" | "cookieFile">,
): Pick<DownloadJobOptions, "browserCookies" | "cookieFile"> {
  const ctx = normalizeBrowserContext(settings.browserContext);
  return {
    browserCookies: ctx === "custom" ? "" : ctx,
    cookieFile: ctx === "custom" ? settings.cookieFile : "",
  };
}

export function buildDownloadJobOptions(
  settings: RuforgeSettings,
  outputDir: string,
  choice: DuplicateDownloadChoice = "replace",
): DownloadJobOptions {
  const filenameTemplate =
    choice === "create_new"
      ? SAVE_AS_NEW_FILENAME_TEMPLATE
      : DEFAULT_FILENAME_TEMPLATE;
  const audioOnly = settings.downloadAudioOnly === true;
  const cookies = cookieContextFromSettings(settings);
  return patchDownloadJobOptionsForAudio(
    {
      format: ytdlpFormatFromSettings(settings),
      outputDir,
      filenameTemplate,
      browserCookies: cookies.browserCookies,
      cookieFile: cookies.cookieFile,
      subLangs: "",
      audioOnly: false,
      audioFormat: normalizeDownloadAudioFormat(settings.downloadAudioFormat),
      autoScrubberPreviews: settings.autoDownloadScrubberPreviews !== false,
    },
    audioOnly,
    settings,
  );
}

export function toInvokeDownloadOptions(opts: DownloadJobOptions) {
  return {
    format: opts.format,
    output_dir: opts.outputDir,
    filename_template: opts.filenameTemplate,
    browser_cookies: opts.browserCookies,
    cookie_file: opts.cookieFile,
    sub_langs: opts.subLangs,
    audio_only: opts.audioOnly,
    audio_format: opts.audioFormat,
    auto_scrub_previews: opts.autoScrubberPreviews !== false,
    playlist_output_folder: opts.playlistOutputFolder ?? null,
    playlist_index: opts.playlistIndex ?? null,
  };
}

export type PlaylistBatchEnqueueMeta = {
  title?: string;
  approval?: "auto" | "pending" | "held";
  playlistOutputFolder?: string;
  playlistIndex?: number;
};

function normalizePersistedDownloadJob(j: DownloadJob): DownloadJob | null {
  if (!j || typeof j.id !== "string" || typeof j.url !== "string") return null;
  if (
    j.status !== "queued" &&
    j.status !== "paused" &&
    j.status !== "downloading"
  ) {
    return null;
  }

  /** yt-dlp does not survive a full app reload — show the row as paused until the user resumes. */
  const wasActive = j.status === "downloading";
  const status: DownloadJob["status"] = wasActive ? "paused" : j.status;

  let approval = j.approval;
  if (!approval) {
    approval = status === "paused" ? "manual" : "held";
  } else if (status === "queued" && approval === "auto") {
    /** Never auto-start a cold session from sessionStorage (pre-download queue). */
    approval = "held";
  } else if (status === "paused" && approval === "auto") {
    /** Paused / in-flight rows must not re-enter the auto pump on refresh. */
    approval = "manual";
  }

  const resumeOnStart =
    wasActive || j.resumeOnStart === true ? true : Boolean(j.resumeOnStart);

  const opts = j.options;
  let options: DownloadJobOptions = {
    ...opts,
    audioOnly: opts?.audioOnly === true,
    audioFormat: normalizeDownloadAudioFormat(opts?.audioFormat),
    autoScrubberPreviews: opts?.autoScrubberPreviews !== false,
  };
  if (options.audioOnly) {
    options = {
      ...options,
      format: "bestaudio/best",
      subLangs: "",
    };
  }
  return {
    ...j,
    status,
    approval,
    options,
    resumeOnStart,
    error: wasActive ? null : j.error,
  };
}

function downloadJobUrlRank(j: DownloadJob): number {
  if (j.status === "downloading") return 4;
  if (j.status === "paused") return 3;
  if (j.status === "queued") return 2;
  return 1;
}

/** One queue row per video URL — keeps the most active / newest job. */
export function collapseDownloadJobsByUrl(jobs: DownloadJob[]): DownloadJob[] {
  const byUrl = new Map<string, DownloadJob>();
  for (const j of jobs) {
    const key = normalizeYouTubeUrlForCompare(j.url);
    const prev = byUrl.get(key);
    if (!prev) {
      byUrl.set(key, j);
      continue;
    }
    const keep =
      downloadJobUrlRank(j) > downloadJobUrlRank(prev) ||
      (downloadJobUrlRank(j) === downloadJobUrlRank(prev) &&
        j.createdAt >= prev.createdAt)
        ? j
        : prev;
    byUrl.set(key, keep);
  }
  return jobs.filter((j) => byUrl.get(normalizeYouTubeUrlForCompare(j.url)) === j);
}

export function loadPersistedDownloadJobs(): DownloadJob[] {
  try {
    const raw = sessionStorage.getItem(SESSION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DownloadJob[];
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((j) => normalizePersistedDownloadJob(j as DownloadJob))
      .filter((j): j is DownloadJob => j != null);
    return collapseDownloadJobsByUrl(normalized);
  } catch {
    return [];
  }
}

/** Store bootstrap: restored queue + a sensible hero focus (no pump). */
export function loadInitialDownloadQueueState(): {
  downloadJobs: DownloadJob[];
  focusedJobId: string | null;
} {
  const downloadJobs = loadPersistedDownloadJobs();
  const focusedJobId =
    downloadJobs.find((j) => j.status === "paused")?.id ??
    downloadJobs.find((j) => j.status === "queued")?.id ??
    null;
  return { downloadJobs, focusedJobId };
}

export function persistDownloadJobs(jobs: DownloadJob[]) {
  try {
    const toSave = jobs.filter(
      (j) =>
        j.status === "queued" ||
        j.status === "paused" ||
        j.status === "downloading",
    );
    if (toSave.length === 0) {
      sessionStorage.removeItem(SESSION_QUEUE_KEY);
    } else {
      sessionStorage.setItem(SESSION_QUEUE_KEY, JSON.stringify(toSave));
    }
  } catch {
    /* ignore quota / private mode */
  }
}

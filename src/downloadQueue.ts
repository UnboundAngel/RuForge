import type { DuplicateDownloadChoice } from "./components/DuplicateDownloadDialog";
import { DEFAULT_FILENAME_TEMPLATE, SAVE_AS_NEW_FILENAME_TEMPLATE } from "./duplicateDownload";
import { ytdlpFormatFromPreferredQuality } from "./downloadFormat";
import type { PlaylistItem, ProgressPayload, VideoInfo } from "./types";
import type { RuforgeSettings } from "./store/types";
import { effectiveDownloadSubLangs } from "./store/types";

/** Snapshot from `get_video_info` at enqueue time; drives downloader hero while this job is active. */
export interface DownloadJobMediaSnapshot {
  title: string;
  thumbnail: string;
  duration: number;
  fileSizeBytes?: number | null;
  isPlaylist: boolean;
  playlistItems?: PlaylistItem[];
  uploader?: string | null;
  channel?: string | null;
}

export function videoInfoToDownloadJobSnapshot(info: VideoInfo): DownloadJobMediaSnapshot {
  return {
    title: info.title,
    thumbnail: info.thumbnail ?? "",
    duration: info.duration,
    fileSizeBytes: info.fileSizeBytes ?? null,
    isPlaylist: info.isPlaylist,
    playlistItems: info.playlistItems,
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
  if (m.fileSizeBytes === undefined) return true;
  return false;
}

export type DownloadJobStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed";

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

export function buildDownloadJobOptions(
  settings: RuforgeSettings,
  outputDir: string,
  choice: DuplicateDownloadChoice = "replace",
): DownloadJobOptions {
  const filenameTemplate =
    choice === "create_new"
      ? SAVE_AS_NEW_FILENAME_TEMPLATE
      : DEFAULT_FILENAME_TEMPLATE;
  return {
    format: ytdlpFormatFromPreferredQuality(settings.preferredQuality),
    outputDir,
    filenameTemplate,
    browserCookies:
      settings.browserContext === "custom" ? "" : settings.browserContext,
    cookieFile:
      settings.browserContext === "custom" ? settings.cookieFile : "",
    subLangs: effectiveDownloadSubLangs(settings),
  };
}

export function toInvokeDownloadOptions(opts: DownloadJobOptions) {
  return {
    format: opts.format,
    output_dir: opts.outputDir,
    filename_template: opts.filenameTemplate,
    browser_cookies: opts.browserCookies,
    cookie_file: opts.cookieFile,
    sub_langs: opts.subLangs,
  };
}

function normalizePersistedDownloadJob(j: DownloadJob): DownloadJob | null {
  if (!j || typeof j.id !== "string" || typeof j.url !== "string") return null;
  if (j.status !== "queued" && j.status !== "paused") return null;
  let approval = j.approval;
  if (!approval) {
    approval = j.status === "paused" ? "manual" : "held";
  } else if (j.status === "queued" && approval === "auto") {
    /** Never auto-start a cold session from sessionStorage (pre-download queue). */
    approval = "held";
  }
  return { ...j, approval };
}

export function loadPersistedDownloadJobs(): DownloadJob[] {
  try {
    const raw = sessionStorage.getItem(SESSION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DownloadJob[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((j) => normalizePersistedDownloadJob(j as DownloadJob))
      .filter((j): j is DownloadJob => j != null);
  } catch {
    return [];
  }
}

export function persistDownloadJobs(jobs: DownloadJob[]) {
  try {
    const toSave = jobs.filter(
      (j) => j.status === "queued" || j.status === "paused",
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

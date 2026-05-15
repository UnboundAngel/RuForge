import type { DuplicateDownloadChoice } from "./components/DuplicateDownloadDialog";
import { DEFAULT_FILENAME_TEMPLATE, SAVE_AS_NEW_FILENAME_TEMPLATE } from "./duplicateDownload";
import { ytdlpFormatFromPreferredQuality } from "./downloadFormat";
import type { ProgressPayload } from "./types";
import type { RuforgeSettings } from "./store/types";
import { effectiveDownloadSubLangs } from "./store/types";

export type DownloadJobStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed";

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
  status: DownloadJobStatus;
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

export const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 1;

const SESSION_QUEUE_KEY = "ruforge-download-queue";

export function createDownloadJobId(): string {
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

export function loadPersistedDownloadJobs(): DownloadJob[] {
  try {
    const raw = sessionStorage.getItem(SESSION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DownloadJob[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (j) =>
        j &&
        typeof j.id === "string" &&
        typeof j.url === "string" &&
        (j.status === "queued" || j.status === "paused"),
    );
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

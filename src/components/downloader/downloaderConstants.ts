import {
  LIBRARY_DUPLICATE_SKIP_MESSAGE,
  type DownloadJob,
} from "../../downloadQueue";
import type { ProgressPayload } from "../../types";

export const URL_PACER_EASE = [0.23, 1, 0.32, 1] as const;
export const RF_DOWNLOADER_PANEL =
  "rounded-2xl border border-white/5 bg-[#271C18]/60 backdrop-blur-md";

export { LIBRARY_DUPLICATE_SKIP_MESSAGE, LIBRARY_DUPLICATE_SKIP_ROW_MS } from "../../downloadQueue";

export const DOWNLOAD_JOB_STATUS_LABEL: Record<DownloadJob["status"], string> = {
  queued: "Queued",
  downloading: "Downloading",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  timed_out: "Timed out",
  skipped: LIBRARY_DUPLICATE_SKIP_MESSAGE,
};

/** Queue/hero label while `job.status === "downloading"` (IPC `progress.status` can be `processing`). */
export function downloadProgressPhaseLabel(
  progress: Pick<ProgressPayload, "status"> | null | undefined,
  isPlaylist?: boolean,
): string {
  if (progress?.status === "processing") {
    return isPlaylist ? "Processing Collection…" : "Processing…";
  }
  if (progress?.status === "downloading") {
    return isPlaylist ? "Downloading Collection" : "Downloading Media";
  }
  return DOWNLOAD_JOB_STATUS_LABEL.downloading;
}
export const BROWSER_OPTIONS = [
  { value: "ruforge", label: "Internal" },
  { value: "firefox", label: "Firefox" },
  { value: "edge", label: "Edge" },
  { value: "safari", label: "Safari" },
  { value: "brave", label: "Brave" },
  { value: "custom", label: "Cookies" },
  { value: "", label: "None" },
] as const;

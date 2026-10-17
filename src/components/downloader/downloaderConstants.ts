import {
  LIBRARY_DUPLICATE_SKIP_MESSAGE,
  type DownloadJob,
} from "../../downloadQueue";
import type { ProgressPayload } from "../../types";

export const URL_PACER_EASE = [0.23, 1, 0.32, 1] as const;
export const RF_DOWNLOADER_PANEL =
  "rounded-2xl border border-white/5 bg-[color:var(--rf-surface)]/60 backdrop-blur-md";

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
    return isPlaylist ? "Finishing collection…" : "Finishing up";
  }
  if (progress?.status === "downloading") {
    return isPlaylist ? "Downloading collection" : "Downloading";
  }
  return DOWNLOAD_JOB_STATUS_LABEL.downloading;
}
export const BROWSER_OPTIONS = [
  { value: "ruforge", label: "Internal", hint: "Uses the account you signed into in Explorer" },
  { value: "firefox", label: "Firefox", hint: "Reads your Firefox sign-in, even while Firefox is open" },
  { value: "zen", label: "Zen", hint: "Reads your Zen sign-in, even while Zen is open" },
  { value: "custom", label: "Folder", hint: "Uses a cookies.txt file you pick" },
  { value: "", label: "None", hint: "Public videos only" },
] as const;

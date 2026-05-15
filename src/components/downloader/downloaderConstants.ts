import type { DownloadJob } from "../../downloadQueue";

export const URL_PACER_EASE = [0.23, 1, 0.32, 1] as const;
export const RF_DOWNLOADER_PANEL =
  "rounded-2xl border border-white/5 bg-[#271C18]/60 backdrop-blur-md";
export const DOWNLOAD_JOB_STATUS_LABEL: Record<DownloadJob["status"], string> = {
  queued: "Queued",
  downloading: "Downloading",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
};
export const BROWSER_OPTIONS = [
  { value: "ruforge", label: "Internal" },
  { value: "firefox", label: "Firefox" },
  { value: "edge", label: "Edge" },
  { value: "safari", label: "Safari" },
  { value: "brave", label: "Brave" },
  { value: "custom", label: "Cookies" },
  { value: "", label: "None" },
] as const;

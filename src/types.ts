export interface MediaFile {
  name: string;
  path: string;
  size: number;
  created: number;
  duration: number;
  thumbnailPath: string | null;
  ruforgePosterPath: string | null;
  subtitlePath: string | null;
  chapters: Chapter[] | null;
  downloadMetadataHint: string | null;
  sourceUrl: string | null;
}

export interface PlaylistCollection {
  kind: "playlist";
  title: string;
  path: string;
  itemCount: number;
  combinedDuration: number;
  stackThumbnailPath: string | null;
  items: MediaFile[];
}

export interface SingleMediaEntry extends MediaFile {
  kind: "media";
}

export type GalleryEntry = SingleMediaEntry | PlaylistCollection;

export interface Chapter {
  start_time: number;
  end_time: number;
  title: string;
}

export interface PlaylistItem {
  title: string;
  thumbnail: string;
  duration: number;
  /** yt-dlp entry id when present (often the watch id). */
  id?: string;
  webpageUrl?: string;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  formats: any[];
  fileSizeBytes?: number | null;
  isPlaylist: boolean;
  playlistItems?: PlaylistItem[];
  uploader?: string | null;
  channel?: string | null;
}

export interface ProgressPayload {
  jobId: string;
  percentage: number;
  speed: string;
  eta: string;
  status: string;
  currentIndex?: number;
  totalItems?: number;
  currentItemTitle?: string;
  /** Estimated whole-file bytes when parsed from yt-dlp stdout (IEC-ish units). */
  downloadedBytes?: number;
  totalBytes?: number;
}

export interface YtdlpUpdateStatusPayload {
  bundledVersion: string;
  activeVersion: string;
  activeSource: string;
  latestVersion?: string | null;
  updateAvailable: boolean;
  lastChecked?: number | null;
  checkError?: string | null;
}

/** Emitted during `download_ytdlp_update`; matches Rust camelCase serde. */
export interface YtdlpUpdateDownloadProgressPayload {
  phase: string;
  percent?: number | null;
}

/** Normalize Tauri event payload (camelCase from Rust; tolerate legacy snake_case). */
export function normalizeProgressPayload(
  raw: ProgressPayload & { job_id?: string; downloaded_bytes?: number; total_bytes?: number },
): ProgressPayload | null {
  const jobId = raw.jobId ?? raw.job_id;
  if (!jobId) return null;
  const dl = raw.downloadedBytes ?? raw.downloaded_bytes;
  const ttl = raw.totalBytes ?? raw.total_bytes;
  return {
    jobId,
    percentage: raw.percentage ?? 0,
    speed: raw.speed ?? "",
    eta: raw.eta ?? "",
    status: raw.status ?? "downloading",
    currentIndex: raw.currentIndex,
    totalItems: raw.totalItems,
    currentItemTitle: raw.currentItemTitle,
    ...(typeof dl === "number" && dl >= 0 ? { downloadedBytes: dl } : {}),
    ...(typeof ttl === "number" && ttl > 0 ? { totalBytes: ttl } : {}),
  };
}

/** `probe_local_media_ffprobe` payload (camelCase from Rust). Not a guarantee WebView decoded the same way. */
export interface FfprobeHint {
  ok: boolean;
  codecsLine?: string;
  bitrateKbps?: number;
  formatName?: string;
  error?: string;
}

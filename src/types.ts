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
  /** yt-dlp video id from sidecar `.info.json` `id` (when `sourceUrl` is missing). */
  sourceId: string | null;
  /** yt-dlp `playlist_index` from sidecar when downloaded as part of a playlist. */
  playlistIndex?: number | null;
  /** Artist tag (ID3/Vorbis/AAC). Audio-only files only. */
  artist?: string | null;
  /** Album name tag. Audio-only files only. */
  album?: string | null;
  /** Album artist tag (ID3 TPE2 / Vorbis ALBUMARTIST). */
  albumArtist?: string | null;
  /** Track number from tags. */
  trackNo?: number | null;
  /** Path to extracted embedded cover art cached on disk. */
  embeddedCoverPath?: string | null;
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
  fileSizeBytes?: number | null;
  fileSizeBytesAudio?: number | null;
  fileSizeBytesVideo?: number | null;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  formats: any[];
  fileSizeBytes?: number | null;
  fileSizeBytesAudio?: number | null;
  fileSizeBytesVideo?: number | null;
  isPlaylist: boolean;
  playlistItems?: PlaylistItem[];
  uploader?: string | null;
  channel?: string | null;
}

/** Live yt-dlp phase on `download-progress` IPC; `DownloadJob.status` stays `downloading` until finished. */
export type DownloadProgressPhase = "downloading" | "processing";

export interface ProgressPayload {
  jobId: string;
  percentage: number;
  speed: string;
  eta: string;
  status: DownloadProgressPhase | string;
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

function finiteNonNegativeNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function finitePositiveNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Normalize Tauri event payload (camelCase from Rust; tolerate legacy snake_case). */
export function normalizeProgressPayload(
  raw: ProgressPayload & { job_id?: string; downloaded_bytes?: number; total_bytes?: number },
): ProgressPayload | null {
  const jobId = raw.jobId ?? raw.job_id;
  if (!jobId) return null;
  const dl = raw.downloadedBytes ?? raw.downloaded_bytes;
  const ttl = raw.totalBytes ?? raw.total_bytes;
  const pctRaw = raw.percentage ?? 0;
  const percentage = typeof pctRaw === "number" && Number.isFinite(pctRaw) ? pctRaw : 0;
  const currentIndex =
    typeof raw.currentIndex === "number" && Number.isFinite(raw.currentIndex) ? raw.currentIndex : undefined;
  const totalItems =
    typeof raw.totalItems === "number" && Number.isFinite(raw.totalItems) ? raw.totalItems : undefined;
  return {
    jobId,
    percentage,
    speed: raw.speed ?? "",
    eta: raw.eta ?? "",
    status:
      raw.status === "processing" || raw.status === "downloading"
        ? raw.status
        : "downloading",
    currentIndex,
    totalItems,
    currentItemTitle: raw.currentItemTitle,
    ...(finiteNonNegativeNumber(dl) ? { downloadedBytes: dl } : {}),
    ...(finitePositiveNumber(ttl) ? { totalBytes: ttl } : {}),
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

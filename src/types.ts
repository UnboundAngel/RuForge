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
  id: string;
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
}

/** Normalize Tauri event payload (camelCase from Rust; tolerate legacy snake_case). */
export function normalizeProgressPayload(
  raw: ProgressPayload & { job_id?: string },
): ProgressPayload | null {
  const jobId = raw.jobId ?? raw.job_id;
  if (!jobId) return null;
  return {
    jobId,
    percentage: raw.percentage ?? 0,
    speed: raw.speed ?? "",
    eta: raw.eta ?? "",
    status: raw.status ?? "downloading",
    currentIndex: raw.currentIndex,
    totalItems: raw.totalItems,
    currentItemTitle: raw.currentItemTitle,
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

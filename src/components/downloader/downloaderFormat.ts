import { formatStorageSize } from "../../formatStorageSize";
import type { VideoInfo } from "../../types";

/** Approximate download size (hero / queue); same ceiling rules as library. */
export function formatApproxFileSize(bytes: number): string {
  return formatStorageSize(bytes);
}

/** Finite seconds >= 0; invalid yt-dlp / JSON values become 0. */
export function normalizeDurationSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return seconds;
}

export function formatDuration(seconds: number): string {
  const total = normalizeDurationSeconds(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Normalize duration fields on hero metadata from `get_video_info`. */
export function sanitizeVideoInfo(info: VideoInfo): VideoInfo {
  const playlistItems = info.playlistItems?.map((item) => ({
    ...item,
    duration: normalizeDurationSeconds(item.duration),
  }));
  return {
    ...info,
    duration: normalizeDurationSeconds(info.duration),
    ...(playlistItems ? { playlistItems } : {}),
  };
}

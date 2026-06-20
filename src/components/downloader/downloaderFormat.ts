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

/** Whole-number MB/s for the immersive downloader hero (rounded up from yt-dlp speed strings). */
export function formatHeroDownloadSpeed(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || /^0\s/i.test(t)) return null;

  const mib = t.match(/^([\d.]+)\s*MiB\/s$/i);
  if (mib) {
    const n = Number.parseFloat(mib[1]!);
    if (!Number.isFinite(n) || n <= 0) return null;
    return `${Math.ceil(n)} MB/s`;
  }

  const kib = t.match(/^([\d.]+)\s*KiB\/s$/i);
  if (kib) {
    const n = Number.parseFloat(kib[1]!);
    if (!Number.isFinite(n) || n <= 0) return null;
    const mibVal = n / 1024;
    return mibVal >= 1 ? `${Math.ceil(mibVal)} MB/s` : "1 MB/s";
  }

  const mb = t.match(/^([\d.]+)\s*MB\/s$/i);
  if (mb) {
    const n = Number.parseFloat(mb[1]!);
    if (!Number.isFinite(n) || n <= 0) return null;
    return `${Math.ceil(n)} MB/s`;
  }

  return null;
}

export function isHttpUrlString(raw: string | undefined | null): boolean {
  return /^https?:\/\//i.test((raw ?? "").trim());
}

/** Title safe for carousel overlay; never returns a bare URL. */
export function sanitizeCarouselDisplayTitle(raw: string | undefined | null): string {
  const t = (raw ?? "").trim();
  if (!t || isHttpUrlString(t)) return "";
  return t;
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

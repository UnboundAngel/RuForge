import type { RuforgeSettings } from "./store/types";

/** Maps Settings → Preferred Quality labels to yt-dlp `-f` format strings (YouTube-friendly). */

export const DOWNLOAD_AUDIO_FORMAT_OPTIONS = ["m4a", "mp3", "opus"] as const;
export type DownloadAudioFormat = (typeof DOWNLOAD_AUDIO_FORMAT_OPTIONS)[number];

export function normalizeDownloadAudioFormat(raw: string | undefined): DownloadAudioFormat {
  const v = (raw ?? "m4a").toLowerCase();
  if (v === "mp3" || v === "opus") return v;
  return "m4a";
}

export function ytdlpFormatFromPreferredQuality(label: string | undefined): string {
  switch (label) {
    case "4K (2160p)":
      return "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best";
    case "720p":
      return "bestvideo[height<=720]+bestaudio/best[height<=720]/best";
    case "Best Available":
      return "bestvideo*+bestaudio/best/bestvideo+bestaudio";
    case "1080p (HD)":
    default:
      return "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";
  }
}

/** Video `-f` for metadata simulate (always muxed quality, never `bestaudio/best`). */
export function ytdlpVideoFormatForMetadata(
  preferredQuality: string | undefined,
  formatOverride?: string,
): string {
  const fmt = formatOverride?.trim();
  if (fmt && !fmt.includes("bestaudio")) return fmt;
  return ytdlpFormatFromPreferredQuality(preferredQuality);
}

/** `-f` selector for `get_video_info` / job options (audio-only uses bestaudio, not muxed video). */
export function ytdlpFormatFromSettings(
  settings: Pick<RuforgeSettings, "preferredQuality" | "downloadAudioOnly">,
): string {
  if (settings.downloadAudioOnly) return "bestaudio/best";
  return ytdlpFormatFromPreferredQuality(settings.preferredQuality);
}

/** Resolve simulate/download `-f` from a queued job (per-row audio overrides global). */
export function ytdlpFormatForDownloadJob(
  options: { format?: string; audioOnly?: boolean },
  settings: Pick<RuforgeSettings, "preferredQuality" | "downloadAudioOnly">,
): string {
  const fmt = options.format?.trim();
  if (fmt) return fmt;
  if (options.audioOnly) return "bestaudio/best";
  return ytdlpFormatFromSettings(settings);
}

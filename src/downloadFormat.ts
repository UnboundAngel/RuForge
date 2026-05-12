/** Maps Settings → Preferred Quality labels to yt-dlp `-f` format strings (YouTube-friendly). */

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

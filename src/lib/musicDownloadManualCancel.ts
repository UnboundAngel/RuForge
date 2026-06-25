import { extractYouTubeVideoId } from "@/youtubeUrl";

const manualCancelKeys = new Set<string>();

function manualCancelKey(url: string): string {
  return extractYouTubeVideoId(url) ?? url;
}

export function markMusicDownloadManualCancel(url: string): void {
  manualCancelKeys.add(manualCancelKey(url));
}

export function takeMusicDownloadManualCancel(url: string): boolean {
  const key = manualCancelKey(url);
  if (!manualCancelKeys.has(key)) return false;
  manualCancelKeys.delete(key);
  return true;
}

import type { ActiveTab } from "@/store/types";

export function devCaptureContextLabel(activeTab: ActiveTab): string {
  return activeTab;
}

export function devCaptureMusicContextLabel(musicView: string): string {
  return `music-${musicView}`;
}

export function humanizeDevCaptureLabel(contextLabel: string): string {
  if (contextLabel.startsWith("music-")) {
    const view = contextLabel.slice("music-".length);
    return `Music ${view.charAt(0).toUpperCase()}${view.slice(1)}`;
  }
  return contextLabel.charAt(0).toUpperCase() + contextLabel.slice(1);
}

import type { ActiveTab } from "@/store/types";

export function devCaptureContextLabel(activeTab: ActiveTab): string {
  return activeTab;
}

export function devCaptureMusicContextLabel(musicView: string): string {
  return `music-${musicView}`;
}

export function crashPreviewCaptureContextLabel(variant: "ui" | "fatal"): string {
  return `crash-${variant}`;
}

export function humanizeDevCaptureLabel(contextLabel: string): string {
  if (contextLabel === "crash-ui") return "UI crash";
  if (contextLabel === "crash-fatal") return "Fatal crash";
  if (contextLabel.startsWith("music-")) {
    const view = contextLabel.slice("music-".length);
    return `Music ${view.charAt(0).toUpperCase()}${view.slice(1)}`;
  }
  return contextLabel.charAt(0).toUpperCase() + contextLabel.slice(1);
}

/** Island saved row (crash preview path). Toasts use "{humanized} saved". */
export function devCaptureIslandCaption(contextLabel: string): string {
  return `${humanizeDevCaptureLabel(contextLabel)} captured`;
}

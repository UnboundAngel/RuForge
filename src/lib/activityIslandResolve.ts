import type { ActivityRenderState } from "@/lib/activityTypes";
import { isAudioOnlyPath } from "@/mediaKind";
import type { ActiveTab, NavMode } from "@/store/types";

/** Active playback session exists (idle = no session). Drives island content, not visibility. */
export function resolveActivityHasSession(renderState: ActivityRenderState): boolean {
  return renderState !== "idle";
}

/**
 * User is away from the surface that owns playback. Drives expanded vs collapsed pill;
 * the island chrome stays mounted either way (model A).
 */
export function resolveActivityAwayFromSurface(
  renderState: ActivityRenderState,
  activeTab: ActiveTab,
  navMode: NavMode,
): boolean {
  if (renderState === "idle") return false;
  if (renderState === "mini-owned") return true;
  if (renderState === "main-music") return navMode !== "music";
  if (renderState === "main-video") return activeTab !== "player";
  return false;
}

export type ActivitySurfaceNavigation = {
  setNavMode: (mode: NavMode) => void;
  setActiveTab: (tab: ActiveTab) => void;
};

/** Return the user to the shell that owns current playback (music mode vs player tab). */
export function navigateToActivityOwningSurface(
  renderState: ActivityRenderState,
  filePath: string | null | undefined,
  nav: ActivitySurfaceNavigation,
): void {
  if (renderState === "main-music") {
    nav.setNavMode("music");
    return;
  }

  if (renderState === "mini-owned" && filePath && isAudioOnlyPath(filePath)) {
    nav.setNavMode("music");
    return;
  }

  if (renderState === "main-video" || renderState === "mini-owned") {
    nav.setActiveTab("player");
  }
}
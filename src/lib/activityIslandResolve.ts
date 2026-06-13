import type { ActivityRenderState } from "@/lib/activityTypes";
import type { ActiveTab, NavMode } from "@/store/types";

export function resolveActivityShowIsland(
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

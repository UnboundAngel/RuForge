import type { IslandState } from "@/components/island/DynamicIsland";

export type IslandExpandedTarget = "music" | "watchlist" | "download" | null;

type OverlayInputs = {
  expandedTarget: IslandExpandedTarget;
  hasSession: boolean;
  hasNotice: boolean;
  hasDownload: boolean;
  watchlist: { takeover: boolean } | null;
};

/**
 * Desktop overlay priority. A fresh upload batch beats the music pill for a few seconds,
 * then music takes the slot back; with no music the watchlist pill stays until seen.
 */
export function resolveOverlayIslandState(i: OverlayInputs): IslandState {
  if (i.expandedTarget === "watchlist" && i.watchlist) return "watchlist-expanded";
  if (i.expandedTarget === "music" && i.hasSession) return "expanded";
  if (i.expandedTarget === "download" && i.hasDownload) return "download-expanded";
  if (i.hasNotice) return "notice";
  if (i.watchlist && (i.watchlist.takeover || !i.hasSession)) return "watchlist";
  if (i.hasSession) return "compact";
  if (i.hasDownload) return "download";
  return "idle";
}

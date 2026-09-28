import type { RightPanelTab } from "./MusicRightPanel";

const LS_NAV_COLLAPSED = "ruforge-music-nav-collapsed";
const LS_RIGHT_PANEL = "ruforge-music-right-panel";

const TABS: readonly RightPanelTab[] = ["nowPlaying", "queue", "history", "segments"];

export type RightPanelPref = { open: boolean; tab: RightPanelTab };

export function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_NAV_COLLAPSED) === "1";
  } catch {
    return false;
  }
}

export function writeNavCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(LS_NAV_COLLAPSED, collapsed ? "1" : "0");
  } catch {
    // storage not available
  }
}

/** Null until the user has opened or closed the panel themselves. */
export function readRightPanelPref(): RightPanelPref | null {
  try {
    const raw = localStorage.getItem(LS_RIGHT_PANEL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RightPanelPref>;
    const tab = TABS.includes(parsed.tab as RightPanelTab) ? (parsed.tab as RightPanelTab) : "queue";
    return { open: parsed.open === true, tab };
  } catch {
    return null;
  }
}

export function writeRightPanelPref(pref: RightPanelPref): void {
  try {
    localStorage.setItem(LS_RIGHT_PANEL, JSON.stringify(pref));
  } catch {
    // storage not available
  }
}

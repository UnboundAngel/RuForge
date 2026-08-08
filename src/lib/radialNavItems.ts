import type { RadialMenuItem } from "@/components/ui/radial-menu";
import type { ActiveTab, MusicView, NavMode } from "@/store/types";

export type RadialNavAction =
  | { kind: "tab"; tab: ActiveTab }
  | { kind: "music"; view: MusicView }
  | { kind: "music-exit-settings" };

type RadialNavItemDef = RadialMenuItem & { action: RadialNavAction };

const DEFAULT_ITEMS: RadialNavItemDef[] = [
  {
    id: "downloader",
    label: "Download",
    iconId: "download",
    hintPlacement: "top",
    action: { kind: "tab", tab: "downloader" },
  },
  {
    id: "media",
    label: "Videos",
    iconId: "videos",
    hintPlacement: "right",
    action: { kind: "tab", tab: "media" },
  },
  {
    id: "explorer",
    label: "YouTube",
    iconId: "explorer",
    hintPlacement: "bottom",
    action: { kind: "tab", tab: "explorer" },
  },
  {
    id: "settings",
    label: "System",
    iconId: "settings",
    hintPlacement: "left",
    action: { kind: "tab", tab: "settings" },
  },
];

const MUSIC_ITEMS: RadialNavItemDef[] = [
  {
    id: "music-home",
    label: "Home",
    iconId: "music-home",
    hintPlacement: "top",
    action: { kind: "music", view: "home" },
  },
  {
    id: "music-explore",
    label: "Explore",
    iconId: "music-explore",
    hintPlacement: "right",
    action: { kind: "music", view: "explore" },
  },
  {
    id: "music-library",
    label: "Library",
    iconId: "music-library",
    hintPlacement: "bottom",
    action: { kind: "music", view: "library" },
  },
  {
    id: "settings",
    label: "System",
    iconId: "music-settings",
    hintPlacement: "left",
    action: { kind: "music-exit-settings" },
  },
];

const BY_MODE: Record<NavMode, RadialNavItemDef[]> = {
  default: DEFAULT_ITEMS,
  music: MUSIC_ITEMS,
};

export function radialMenuItemsForMode(navMode: NavMode): RadialMenuItem[] {
  return BY_MODE[navMode];
}

export function radialNavActionForItem(
  navMode: NavMode,
  itemId: string,
): RadialNavAction | null {
  const hit = BY_MODE[navMode].find((row) => row.id === itemId);
  return hit?.action ?? null;
}

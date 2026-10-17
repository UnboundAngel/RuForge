import type { RadialMenuItem } from "@/components/ui/radial-menu";
import type { ActiveTab, MusicView, NavMode } from "@/store/types";
import { GAMES_RAIL_ITEM } from "@games";

export type RadialNavAction =
  | { kind: "tab"; tab: ActiveTab }
  | { kind: "music"; view: MusicView }
  | { kind: "settings" };

type RadialNavItemDef = RadialMenuItem & { action: RadialNavAction };

const DEFAULT_ITEMS: RadialNavItemDef[] = [
  {
    id: "downloader",
    label: "Download",
    iconId: "download",
    action: { kind: "tab", tab: "downloader" },
  },
  {
    id: "media",
    label: "Videos",
    iconId: "videos",
    action: { kind: "tab", tab: "media" },
  },
  {
    id: "explorer",
    label: "YouTube",
    iconId: "explorer",
    action: { kind: "tab", tab: "explorer" },
  },
  ...(GAMES_RAIL_ITEM ? [GAMES_RAIL_ITEM.radial as RadialNavItemDef] : []),
  {
    id: "settings",
    label: "Settings",
    iconId: "settings",
    action: { kind: "tab", tab: "settings" },
  },
];

const MUSIC_ITEMS: RadialNavItemDef[] = [
  {
    id: "music-home",
    label: "Home",
    iconId: "music-home",
    action: { kind: "music", view: "home" },
  },
  {
    id: "music-explore",
    label: "Explore",
    iconId: "music-explore",
    action: { kind: "music", view: "explore" },
  },
  {
    id: "music-library",
    label: "Library",
    iconId: "music-library",
    action: { kind: "music", view: "library" },
  },
  {
    id: "settings",
    label: "Settings",
    iconId: "music-settings",
    action: { kind: "settings" },
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

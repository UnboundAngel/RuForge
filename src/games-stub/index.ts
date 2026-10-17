import type { CSSProperties, ReactElement, ReactNode } from "react";
import { registerGamesHotkeyDefs } from "@/lib/hotkeys";
import {
  normalizeGames,
  preserveGames,
  registerGamesNormalizer,
  type GameRecord,
} from "@/lib/gamesSettings";

registerGamesHotkeyDefs([]);
registerGamesNormalizer(preserveGames);

export type { GameRecord };
export { normalizeGames };

export type GamesHotkeyActionId =
  | "library.goGames"
  | "games.openPinnedGlance"
  | "overlay.toggle";

export type GamesRailItem = {
  id: "games";
  iconId: "games";
  label: string;
  radial: {
    id: string;
    label: string;
    iconId: "games";
    action: { kind: "tab"; tab: "games" };
  };
};

/** Structural stand-in; stub never yields a recommendation. */
export type RecommendedGamePlaylist = {
  game: GameRecord;
  tagged: { path: string }[];
  missing: { path: string }[];
  newest: { path: string } | null;
  playlist: { id: string } | null;
};

export const GAMES_HOTKEY_DEFS: readonly [] = [];
export const GAMES_ENABLED = false;
export const GAMES_GO_HOTKEY_ID: string | null = null;
export const GAMES_RAIL_ITEM: GamesRailItem | null = null;
export const GAMES_WINDOW_ROUTES: readonly [] = [];

export function isBrowseTab(tab: string): tab is "media" | "games" {
  return tab === "media" || tab === "games";
}

export function openGameTag(_tagId: string): boolean {
  return false;
}

export function addPendingGameTag(_videoId: string, _gameId: string): void {}

export function takePendingGameTag(
  _videoId: string | null | undefined,
): { videoId: string; gameId: string; at: number } | null {
  return null;
}

export function gamesWindowLabelFromDocument(): string | null {
  return null;
}

export function renderGamesWindow(_label: string): ReactElement | null {
  return null;
}

export function GamesView(): null {
  return null;
}

export function GlanceHost(): null {
  return null;
}

export function GamesSettingsSection(): null {
  return null;
}

export function GamesShortcutsRows(): null {
  return null;
}

export function GlanceAdblockSettingsSection(_props: { active: boolean }): null {
  return null;
}

export function ExplorerGameScopePill(): null {
  return null;
}

export function RecommendedGamePlaylistsSlot(props: {
  taggableFiles: unknown;
  virtualPlaylistRecords: unknown;
  columns: number;
  gridClassName: string;
  gridStyle: CSSProperties;
  onAdd: (rec: RecommendedGamePlaylist) => void;
  children: (recommendedSection: ReactNode) => ReactNode;
}): ReactNode {
  void props.onAdd;
  return props.children(null);
}

export function useGamesAppShell(_opts: {
  onMain: boolean;
  settings: unknown;
  // Widen so core's notify is assignable without importing the store type.
  notify: (message: string, ...rest: never[]) => unknown;
  activeTab: string;
  reportTakenChords: (chords: string[]) => void;
}): {
  gamesStrip: false;
  gamesStripTabs: null;
  closeGamePage: () => void;
} {
  return { gamesStrip: false, gamesStripTabs: null, closeGamePage: () => {} };
}

export function useMiniAutoGhost(opts: {
  settings: { miniGhostOpacity?: number };
  canGhost: boolean;
  ghostMode: boolean;
  setGhostMode: (on: boolean) => void;
}): { ghostOpacity: number; noteManualToggle: () => void } {
  void opts.canGhost;
  void opts.ghostMode;
  void opts.setGhostMode;
  const raw = opts.settings.miniGhostOpacity;
  const ghostOpacity =
    typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0.15, raw)) : 1;
  return { ghostOpacity, noteManualToggle: () => {} };
}

export function useMiniArrange(_opts: {
  ghostModeRef: { current: boolean };
  setGhostMode: (on: boolean) => void;
  ghostOpacity: number;
}): void {}

export function useMusicMiniArrange(): void {}

export type ActiveTab = "downloader" | "media" | "player" | "settings" | "explorer";

export type SettingsTab = "general" | "downloads" | "appearance" | "advanced";

export type GalleryFilter = "all" | "in-progress" | "watched";

export const RUFORGE_INTERNAL_DIR = "C:\\RuForge\\Media";

export const DEFAULT_OUTPUT_DIR = "C:\\Downloads";

export interface RuforgeSettings {
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  preferredQuality: string;
  accentColor: string;
  gridDensity: string;
  hardwareAcceleration: boolean;
  storageLimitGB: number;
  browserContext: string;
  cookieFile: string;
  audioAutoAdvanceFolder: boolean;
  audioPrefetchNext: boolean;
  subtitlePreferredLang: string | null;
}

export const DEFAULT_SETTINGS: RuforgeSettings = {
  launchAtStartup: true,
  minimizeToTray: true,
  preferredQuality: "1080p (HD)",
  accentColor: "#EDCF9B",
  gridDensity: "Default",
  hardwareAcceleration: true,
  storageLimitGB: 50,
  browserContext: "chrome",
  cookieFile: "",
  audioAutoAdvanceFolder: true,
  audioPrefetchNext: true,
  subtitlePreferredLang: null,
};

export function loadMergedSettings(): RuforgeSettings {
  try {
    const saved = localStorage.getItem("ruforge-settings");
    if (!saved) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(parsed as Partial<RuforgeSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readSidebarExpanded(): boolean {
  return localStorage.getItem("ruforge-sidebar-expanded") !== "false";
}

export function readInitialPathsFromLs(): {
  outputDir: string;
  saveToInternal: boolean;
  isSidebarExpanded: boolean;
} {
  return {
    outputDir: localStorage.getItem("ruforge-output-dir") || DEFAULT_OUTPUT_DIR,
    saveToInternal: localStorage.getItem("ruforge-save-internal") !== "false",
    isSidebarExpanded: readSidebarExpanded(),
  };
}

const LS_MINI_VOLUME = "miniplayer-volume";
const LS_MINI_LOOP = "miniplayer-loop";

/** Volume is a plain float string (e.g. "0.8"); mute is not persisted to disk. */
export function readInitialPlayerVolumeFromLs(): number {
  try {
    const saved = localStorage.getItem(LS_MINI_VOLUME);
    if (!saved) return 0.8;
    const v = parseFloat(saved);
    return Number.isFinite(v) ? v : 0.8;
  } catch {
    return 0.8;
  }
}

export function readInitialPlayerLoopFromLs(): boolean {
  return localStorage.getItem(LS_MINI_LOOP) === "true";
}

export { LS_MINI_VOLUME, LS_MINI_LOOP };

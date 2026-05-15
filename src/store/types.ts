export type ActiveTab = "downloader" | "media" | "player" | "settings" | "explorer";

export type SettingsTab = "general" | "downloads" | "appearance" | "advanced";

export type GalleryFilter = "all" | "in-progress" | "watched";

export const RUFORGE_INTERNAL_DIR = "C:\\RuForge\\Media";

export const DEFAULT_OUTPUT_DIR = "C:\\Downloads";

/** yt-dlp `--sub-langs` presets; label is Settings UI only. */
export const DOWNLOAD_SUBTITLE_LANG_PRESETS: ReadonlyArray<{ label: string; ytdlp: string }> = [
  { label: "English", ytdlp: "en.*" },
  { label: "Spanish", ytdlp: "es.*" },
  { label: "French", ytdlp: "fr.*" },
  { label: "German", ytdlp: "de.*" },
  { label: "Portuguese", ytdlp: "pt.*" },
  { label: "Japanese", ytdlp: "ja.*" },
  { label: "Korean", ytdlp: "ko.*" },
  { label: "Chinese", ytdlp: "zh.*" },
  { label: "English + Spanish", ytdlp: "en.*,es.*" },
  { label: "English + Spanish + French", ytdlp: "en.*,es.*,fr.*" },
] as const;

export function downloadSubtitleLangLabel(ytdlp: string): string {
  const hit = DOWNLOAD_SUBTITLE_LANG_PRESETS.find((p) => p.ytdlp === ytdlp);
  return hit?.label ?? DOWNLOAD_SUBTITLE_LANG_PRESETS[0].label;
}

/** Value passed to yt-dlp `--sub-langs` from persisted settings. */
export function effectiveDownloadSubLangs(settings: {
  downloadSubtitles: boolean;
  downloadSubtitleLangs: string;
}): string {
  if (!settings.downloadSubtitles) return "";
  const langs = settings.downloadSubtitleLangs?.trim();
  return langs || "en.*";
}

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
  /** When false, yt-dlp skips subtitle sidecars. */
  downloadSubtitles: boolean;
  /** yt-dlp `--sub-langs` for downloads (playback pick is `subtitlePreferredLang`). */
  downloadSubtitleLangs: string;
  /** When true, duplicate YouTube URLs are skipped without prompting. */
  skipDuplicatesAutomatically: boolean;
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
  downloadSubtitles: true,
  downloadSubtitleLangs: "en.*",
  skipDuplicatesAutomatically: false,
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

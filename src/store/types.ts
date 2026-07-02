import type {
  SponsorBlockCategoryMode,
  SponsorBlockCategoryStats,
  SponsorBlockSkipCategory,
} from "../sponsorBlock";
import {
  defaultCategoryModes,
  defaultCategoryStats,
  mergeCategoryModes,
  mergeCategoryStats,
} from "../sponsorBlock";
import {
  DEFAULT_OUTPUT_DIR,
  RUFORGE_INTERNAL_DIR,
} from "../platformPaths";

export type ActiveTab = "downloader" | "media" | "player" | "settings" | "explorer";

/** Shell persona cycled from the radial menu center (logo / settings scope later). */
export type NavMode = "default" | "movie" | "music";

const NAV_MODE_ORDER: NavMode[] = ["default", "movie", "music"];

export function nextNavMode(current: NavMode): NavMode {
  const i = NAV_MODE_ORDER.indexOf(current);
  return NAV_MODE_ORDER[(i + 1) % NAV_MODE_ORDER.length];
}

/** Music shell browse surface (Home / Explore / Library). */
export type MusicView = "home" | "explore" | "library";

/** Drill-down target inside Music mode (artist, album, or song page). */
export type MusicDetail =
  | { kind: "artist"; key: string }
  | { kind: "album"; artistKey: string; key: string }
  | { kind: "song"; path: string }
  | { kind: "liked" }
  | { kind: "profile" }
  | { kind: "stats" };

/** Signed-in YouTube account read from the embedded Explorer session. */
export type YouTubeExplorerProfile = {
  displayName: string;
  avatarUrl: string | null;
  /** @handle when the probe can read it from channel URLs. */
  channelHandle?: string | null;
};

/** Titlebar chip: pending (hydrated cache), signed-in, or signed-out. */
export type YoutubeSessionStatus = "pending" | "signed-in" | "signed-out";

export type SettingsTab =
  | "general"
  | "downloads"
  | "playback"
  | "appearance"
  | "advanced"
  | "debugging";

export type GalleryFilter = "all" | "in-progress" | "watched";

export { DEFAULT_OUTPUT_DIR, RUFORGE_INTERNAL_DIR };

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

/** Hard ceiling for Settings + queue (`downloadQueueSlice` mirrors this from `settings`). */
export const MAX_CONCURRENT_DOWNLOADS_CAP = 6;

export const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 1;

/** Values beyond the three presets use Settings “Custom” (numeric stepper from 4 … cap). */
export const CUSTOM_CONCURRENT_DOWNLOADS_MIN = 4;

export function clampMaxConcurrentDownloads(n: unknown): number {
  const x =
    typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_MAX_CONCURRENT_DOWNLOADS;
  return Math.min(MAX_CONCURRENT_DOWNLOADS_CAP, Math.max(1, x));
}

export interface RuforgeSettings {
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  /** When true, yt-dlp extracts audio only (`-x`) using `downloadAudioFormat`. */
  downloadAudioOnly: boolean;
  /** When true, per-row audio toggles in the download queue also update `downloadAudioOnly`. */
  rememberAudioOnlyDefault: boolean;
  /** yt-dlp `--audio-format` (m4a, mp3, opus). */
  downloadAudioFormat: string;
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
  /** When true, ffmpeg scrubber sprite sheets are built after each video download. */
  autoDownloadScrubberPreviews: boolean;
  /** Parallel yt-dlp jobs (`downloadQueueSlice.maxConcurrentDownloads` mirrors this). */
  maxConcurrentDownloads: number;
  /**
   * Delay in ms between consecutive download job starts in a batch (e.g. music playlist).
   * 0 = disabled (default). Helps avoid rate-limiting on large multi-track grabs.
   */
  downloadJobStartDelayMs: number;
  /** When true, Settings shows the Debugging tab (group playlist, updater UI cycle, etc.). */
  showDebuggingSettings: boolean;
  /** Debug log category ids enabled in Settings > Debugging (synced to Rust on change and boot). */
  debugLogEnabledCategories: string[];
  /**
   * When true, audio files and all-audio playlists are hidden from the main Video Library.
   * Songs remain visible in Music mode regardless of download source.
   */
  hideAudioFromMainLibrary: boolean;
  /** Master SponsorBlock toggle (default false until feature ships). */
  sponsorBlockEnabled: boolean;
  sponsorBlockCategoryModes: Record<SponsorBlockSkipCategory, SponsorBlockCategoryMode>;
  sponsorBlockCategoryStats: Record<SponsorBlockSkipCategory, SponsorBlockCategoryStats>;
  /**
   * When true, playing a song in the YouTube Music webview automatically queues
   * an audio-only download for that track (silently, no prompts).
   */
  autoDownloadPlayingSongs: boolean;
  /** When true, audio download enrich stamps artist genres/MBID on track sidecars. */
  stampTrackSidecarArtistTags: boolean;
  /** When true, single-video downloads fetch YouTube comments into `{stem}.comments.json`. */
  downloadComments: boolean;
  /** When true, anonymous app-launch usage telemetry may be sent (off by default). */
  telemetryUsageEnabled: boolean;
  /** When true, scrubbed crash reports may be sent on failure (off by default). */
  telemetryCrashEnabled: boolean;
  /** User accepted the LAN companion disclosure before enabling the server. */
  companionServerDisclosureAcknowledged: boolean;
}

export const DEFAULT_SETTINGS: RuforgeSettings = {
  launchAtStartup: true,
  minimizeToTray: true,
  downloadAudioOnly: false,
  rememberAudioOnlyDefault: false,
  downloadAudioFormat: "m4a",
  preferredQuality: "1080p (HD)",
  accentColor: "#EDCF9B",
  gridDensity: "Default",
  hardwareAcceleration: true,
  storageLimitGB: 50,
  browserContext: "",
  cookieFile: "",
  audioAutoAdvanceFolder: true,
  audioPrefetchNext: true,
  subtitlePreferredLang: null,
  downloadSubtitles: true,
  downloadSubtitleLangs: "en.*",
  skipDuplicatesAutomatically: false,
  autoDownloadScrubberPreviews: true,
  maxConcurrentDownloads: DEFAULT_MAX_CONCURRENT_DOWNLOADS,
  downloadJobStartDelayMs: 0,
  showDebuggingSettings: false,
  debugLogEnabledCategories: [],
  hideAudioFromMainLibrary: true,
  sponsorBlockEnabled: true,
  sponsorBlockCategoryModes: defaultCategoryModes(),
  sponsorBlockCategoryStats: defaultCategoryStats(),
  autoDownloadPlayingSongs: true,
  stampTrackSidecarArtistTags: true,
  downloadComments: false,
  telemetryUsageEnabled: false,
  telemetryCrashEnabled: false,
  companionServerDisclosureAcknowledged: false,
};

/** Hidden legacy default was `"chrome"` (not in downloader UI). Treat as no cookie source. */
export function normalizeBrowserContext(raw: string | undefined | null): string {
  const v = (raw ?? "").trim();
  if (!v || v === "chrome") return "";
  return v;
}

/** Value for downloader browser-strip selection (None when unset or legacy chrome). */
export function browserContextForDownloaderUi(raw: string | undefined | null): string {
  return normalizeBrowserContext(raw);
}

export function loadMergedSettings(): RuforgeSettings {
  try {
    const saved = localStorage.getItem("ruforge-settings");
    if (!saved) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const merged = { ...DEFAULT_SETTINGS, ...(parsed as Partial<RuforgeSettings>) };
    return {
      ...merged,
      browserContext: normalizeBrowserContext(merged.browserContext),
      maxConcurrentDownloads: clampMaxConcurrentDownloads(merged.maxConcurrentDownloads),
      downloadSubtitles: merged.downloadSubtitles !== false,
      autoDownloadScrubberPreviews: merged.autoDownloadScrubberPreviews !== false,
      autoDownloadPlayingSongs: merged.autoDownloadPlayingSongs !== false,
      stampTrackSidecarArtistTags: merged.stampTrackSidecarArtistTags !== false,
      downloadComments: merged.downloadComments === true,
      showDebuggingSettings: merged.showDebuggingSettings === true,
      debugLogEnabledCategories: Array.isArray(merged.debugLogEnabledCategories)
        ? merged.debugLogEnabledCategories.filter((x): x is string => typeof x === "string")
        : [],
      hideAudioFromMainLibrary: merged.hideAudioFromMainLibrary !== false,
      sponsorBlockEnabled: merged.sponsorBlockEnabled === true,
      sponsorBlockCategoryModes: mergeCategoryModes(merged.sponsorBlockCategoryModes),
      sponsorBlockCategoryStats: mergeCategoryStats(merged.sponsorBlockCategoryStats),
      telemetryUsageEnabled: merged.telemetryUsageEnabled === true,
      telemetryCrashEnabled: merged.telemetryCrashEnabled === true,
      companionServerDisclosureAcknowledged:
        merged.companionServerDisclosureAcknowledged === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readSidebarExpanded(): boolean {
  return localStorage.getItem("ruforge-sidebar-expanded") !== "false";
}

function readNavMode(): NavMode {
  const raw = localStorage.getItem("ruforge-nav-mode");
  if (raw === "movie" || raw === "music" || raw === "default") return raw;
  return "default";
}

export function readInitialPathsFromLs(): {
  isSidebarExpanded: boolean;
  navMode: NavMode;
} {
  return {
    isSidebarExpanded: readSidebarExpanded(),
    navMode: readNavMode(),
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

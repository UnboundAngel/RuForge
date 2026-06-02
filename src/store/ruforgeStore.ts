import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { sanitizeVideoInfo } from "../components/downloader/downloaderFormat";
import type { GalleryEntry, MediaFile, PlaylistCollection, ProgressPayload, VideoInfo } from "../types";
import {
  galleryScanRoots,
  isDirInLibraryScanList,
  normalizeScanDirKey,
  writeLibraryScanDirsToLs,
} from "../libraryScanDirs";
import { ensurePostersForFiles, filesMissingPoster } from "../posterBackfill";
import {
  DEFAULT_SETTINGS,
  LS_MINI_LOOP,
  LS_MINI_VOLUME,
  RUFORGE_INTERNAL_DIR,
  clampMaxConcurrentDownloads,
  readInitialPathsFromLs,
  readInitialPlayerLoopFromLs,
  readInitialPlayerVolumeFromLs,
  nextNavMode,
  type ActiveTab,
  type GalleryFilter,
  type MusicDetail,
  type MusicView,
  type NavMode,
  type RuforgeSettings,
  type SettingsTab,
  type YouTubeExplorerProfile,
} from "./types";
import {
  createRuforgePersistStorage,
  type RuforgePersistedSubset,
} from "./ruforgePersistStorage";
import { loadInitialDownloadQueueState } from "../downloadQueue";
import {
  createDownloadQueueSlice,
  type DownloadQueueSlice,
} from "./downloadQueueSlice";
import { readLoopForPath, writeLoopForPath } from "../playbackLoopStorage";
import { readPlaybackSpeed } from "../playbackSpeedStorage";
import type { PlayInMiniPayload, PlayInMusicMiniPayload } from "../playerHandoff";
import { writePlaybackPos } from "../playbackStorage";
import { dedupeGalleryEntriesCombined } from "../galleryDedupe";
import {
  buildMusicEffectivePlaylist,
  musicEffectivePlaylistIndex,
} from "../lib/musicHandoffQueue";
import type {
  ExportBundleProgressPayload,
  ExportOutcome,
  ExportPanelPreset,
} from "../lib/exportTypes";

export type {
  ActiveTab,
  GalleryFilter,
  MusicDetail,
  MusicView,
  NavMode,
  RuforgeSettings,
  SettingsTab,
  YouTubeExplorerProfile,
} from "./types";
export { RUFORGE_INTERNAL_DIR } from "./types";

export type RuforgeNotification = {
  id: number;
  message: string;
  type?: "info" | "error" | "progress" | "warning";
};

export type GalleryContextMenuState = { path: string; x: number; y: number } | null;

export interface RuforgeStore extends DownloadQueueSlice {
  settings: RuforgeSettings;
  outputDir: string;
  saveToInternal: boolean;
  /** Extra folders scanned for the library (internal vault is always included). */
  libraryScanDirs: string[];
  isSidebarExpanded: boolean;
  navMode: NavMode;
  musicView: MusicView;
  musicDetail: MusicDetail | null;
  storageStats: { total_bytes: number; file_count: number } | null;

  activeTab: ActiveTab;
  settingsTab: SettingsTab;
  galleryFilter: GalleryFilter;
  selectedPlaylist: PlaylistCollection | null;
  isSearchExpanded: boolean;
  searchValue: string;
  lastExplorerUrl: string;
  /** Null when Explorer session is signed out or webview has not reported yet. */
  youtubeExplorerProfile: YouTubeExplorerProfile | null;

  notifications: RuforgeNotification[];

  /** Downloader slice (not persisted). */
  url: string;
  /** True while Replace/Cancel duplicate dialog is open (`DuplicateDownloadDialog`). */
  downloaderDuplicateDialogOpen: boolean;
  metadataLoading: boolean;
  downloading: boolean;
  progress: ProgressPayload | null;
  videoInfo: VideoInfo | null;
  /** Normalized URL last successfully fetched into `videoInfo` (hero metadata). */
  videoInfoUrl: string | null;
  /** `settings.preferredQuality` used for the last hero fetch (refetch when this changes). */
  videoInfoPreferredQuality: string | null;
  metadataError: string | null;
  isFocused: boolean;

  /** Gallery slice (not persisted). Library list matches `MediaView` / `scan_gallery` shape. */
  entries: GalleryEntry[];
  /** Bumps when `entries` is replaced from a successful on-disk gallery scan (`fetchEntries`). */
  libraryScanRevision: number;
  galleryLoading: boolean;
  extractingByPath: Record<string, boolean>;
  activeMenu: GalleryContextMenuState;

  /** Main-window player; `volume` / `isLooping` mirror flat LS keys read by MiniPlayer. */
  playingFile: MediaFile | null;
  folderAudioPlaylist: MediaFile[];
  /**
   * Manual queue paths (FIFO). Drained before effectivePlaylist advances.
   * Paths only — resolved to MediaFile on playback by useMusicPlayback.
   */
  manualQueue: string[];
  /** True when the currently-playing track came from manualQueue (not effectivePlaylist). */
  playingFromManualQueue: boolean;
  /**
   * effectivePlaylist index captured when a manual-queue track started playing.
   * Used by skipPrev so "prev" goes back into the real playlist, not the manual item.
   */
  manualQueueContextIndex: number | null;
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  /** One-shot resume position (seconds) after mini → main handoff. */
  playerResumeAt: number | null;
  /** One-shot resume after music-mini → main handoff. */
  musicPlayerResume: {
    currentTime: number;
    paused: boolean;
    playbackSpeed: number;
  } | null;
  cleanupModalOpen: boolean;

  exportPanelOpen: boolean;
  exportPanelPreset: ExportPanelPreset | null;
  exportInFlight: boolean;
  exportProgress: ExportBundleProgressPayload | null;
  exportOutcome: ExportOutcome | null;

  setPlayingFile: (file: MediaFile | null) => void;
  clearPlayerResumeAt: () => void;
  clearMusicPlayerResume: () => void;
  setFolderAudioPlaylist: (files: MediaFile[]) => void;
  /** Append a path to the manual queue (deduped; ignored if already present). */
  enqueueManualQueue: (path: string) => void;
  /** Remove a single path from the manual queue. */
  removeManualQueue: (path: string) => void;
  /** Replace manual queue order (e.g. drag-reorder); dedupes while preserving order. */
  setManualQueueOrder: (paths: string[]) => void;
  /** Empty the manual queue entirely. */
  clearManualQueue: () => void;
  /**
   * Called by useMusicPlayback when a manual-queue item starts playing.
   * Shifts the path off the front of the queue and stores the context index.
   */
  applyManualQueueAdvance: (contextIndex: number | null) => void;
  /**
   * Called by useMusicPlayback when the track playing from the manual queue
   * is cleared (playback ends without a next track, or user picks something else).
   */
  clearManualQueuePlayingState: () => void;
  setVolume: (v: number) => void;
  setMuted: (muted: boolean) => void;
  setLooping: (loop: boolean) => void;
  stopPlayback: () => void;

  handlePlayFile: (file: MediaFile, playlist?: MediaFile[]) => Promise<void>;
  handlePlayFolderNeighbor: (file: MediaFile) => void;
  handlePlayPlaylist: (files: MediaFile[], shuffle?: boolean) => void;
  handlePopOut: (
    startTime?: number,
    opts?: { paused?: boolean; playbackSpeed?: number },
  ) => Promise<void>;
  handlePopOutMusic: (
    startTime?: number,
    opts?: { paused?: boolean; playbackSpeed?: number },
  ) => Promise<void>;

  updateSetting: (key: keyof RuforgeSettings, value: RuforgeSettings[keyof RuforgeSettings]) => Promise<void>;
  mergeHardwareAccelerationFromBackend: (hw: boolean) => void;

  setOutputDir: (dir: string) => void;
  addLibraryScanDir: (dir: string) => void;
  removeLibraryScanDir: (dir: string) => void;
  handleSetSaveToInternal: (val: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsedByResize: () => void;
  cycleNavMode: () => void;
  setNavMode: (mode: NavMode) => void;
  setMusicView: (view: MusicView) => void;
  openMusicArtist: (key: string) => void;
  openMusicAlbum: (artistKey: string, key: string) => void;
  openMusicSong: (path: string) => void;
  closeMusicDetail: () => void;
  refreshStorageStats: () => Promise<void>;
  openAuthorizeCleanupModal: () => Promise<void>;
  closeAuthorizeCleanupModal: () => void;

  openExportPanel: (preset: ExportPanelPreset) => void;
  closeExportPanel: () => void;
  setExportInFlight: (v: boolean) => void;
  setExportProgress: (p: ExportBundleProgressPayload | null) => void;
  setExportOutcome: (o: ExportOutcome | null) => void;
  resetExportOutcome: () => void;

  setActiveTab: (tab: ActiveTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setGalleryFilter: (f: GalleryFilter) => void;
  setSelectedPlaylist: (p: PlaylistCollection | null) => void;
  setIsSearchExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  setSearchValue: (v: string) => void;
  setLastExplorerUrl: (url: string) => void;
  setYoutubeExplorerProfile: (profile: YouTubeExplorerProfile | null) => void;

  notify: (message: string, type?: RuforgeNotification["type"]) => number;
  dismissNotification: (id: number) => void;

  setDownloaderUrl: (url: string) => void;
  setDownloaderDuplicateDialogOpen: (v: boolean) => void;
  setDownloaderMetadataLoading: (v: boolean) => void;
  setDownloading: (v: boolean) => void;
  setDownloadProgress: (p: ProgressPayload | null) => void;
  setVideoInfo: (
    info: VideoInfo | null,
    meta?: { sourceUrl?: string; preferredQuality?: string },
  ) => void;
  setMetadataError: (err: string | null) => void;
  setDownloaderUrlFocused: (v: boolean) => void;
  resetDownloader: () => void;

  fetchEntries: (opts?: {
    /**
     * When true, sets `galleryLoading` true before awaiting scans.
     * When false, does not touch loading at start (caller may already show a spinner).
     * Clearing `galleryLoading` is not gated by this flag: only the latest in-flight fetch
     * clears it (see `galleryFetchToken` in `fetchEntries`).
     */
    manageLoadingStart?: boolean;
    skipPosterBackfill?: boolean;
    posterEpoch?: number;
  }) => Promise<void>;
  invalidateEntries: (opts?: { silent?: boolean }) => Promise<void>;
  setGalleryActiveMenu: (menu: GalleryContextMenuState) => void;
  setGalleryExtractingPath: (path: string | null) => void;
}

/** Pending `notify` auto-dismiss timers, keyed by notification id. */
const notificationDismissTimers = new Map<number, ReturnType<typeof setTimeout>>();

function forgetNotificationDismissTimer(id: number): void {
  const handle = notificationDismissTimers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    notificationDismissTimers.delete(id);
  }
}

/** Clears all pending auto-dismiss timers (e.g. window unload, Vite HMR module dispose). */
export function clearRuforgeNotificationDismissTimers(): void {
  for (const handle of notificationDismissTimers.values()) {
    clearTimeout(handle);
  }
  notificationDismissTimers.clear();
}

/** Monotonic token: only the latest `fetchEntries` run may write `entries` or clear `galleryLoading`. */
let galleryFetchToken = 0;

/** Serial for poster backfill so stale async work cannot chain a second scan after navigation. */
let galleryPosterEpoch = 0;

const pathsInit = readInitialPathsFromLs();
const playerInitVolume = readInitialPlayerVolumeFromLs();
const playerInitLoop = readInitialPlayerLoopFromLs();
const initialDownloadQueue = loadInitialDownloadQueueState();

export const useRuforgeStore = create<RuforgeStore>()(
  persist(
    (set, get, store) => ({
      ...createDownloadQueueSlice(set, get, store),
      downloadJobs: initialDownloadQueue.downloadJobs,
      focusedJobId: initialDownloadQueue.focusedJobId,

      settings: DEFAULT_SETTINGS,
      outputDir: pathsInit.outputDir,
      saveToInternal: pathsInit.saveToInternal,
      libraryScanDirs: pathsInit.libraryScanDirs,
      isSidebarExpanded: pathsInit.isSidebarExpanded,
      navMode: pathsInit.navMode,
      musicView: "home",
      musicDetail: null,
      storageStats: null,

      activeTab: "downloader",
      settingsTab: "general",
      galleryFilter: "all",
      selectedPlaylist: null,
      isSearchExpanded: false,
      searchValue: "",
      lastExplorerUrl: "https://www.youtube.com",
      youtubeExplorerProfile: null,

      notifications: [],

      url: "",
      downloaderDuplicateDialogOpen: false,
      metadataLoading: false,
      downloading: false,
      progress: null,
      videoInfo: null,
      videoInfoUrl: null,
      videoInfoPreferredQuality: null,
      metadataError: null,
      isFocused: false,

      entries: [],
      libraryScanRevision: 0,
      galleryLoading: true,
      extractingByPath: {},
      activeMenu: null,

      playingFile: null,
      folderAudioPlaylist: [],
      manualQueue: [],
      playingFromManualQueue: false,
      manualQueueContextIndex: null,
      volume: playerInitVolume,
      isMuted: false,
      isLooping: playerInitLoop,
      playerResumeAt: null,
      musicPlayerResume: null,
      cleanupModalOpen: false,

      exportPanelOpen: false,
      exportPanelPreset: null,
      exportInFlight: false,
      exportProgress: null,
      exportOutcome: null,

      setPlayingFile: (playingFile) => {
        const isLooping = playingFile ? readLoopForPath(playingFile.path) : false;
        set({ playingFile, isLooping });
      },
      clearPlayerResumeAt: () => set({ playerResumeAt: null }),
      clearMusicPlayerResume: () => set({ musicPlayerResume: null }),
      setFolderAudioPlaylist: (folderAudioPlaylist) => set({ folderAudioPlaylist }),

      enqueueManualQueue: (path) => {
        const { manualQueue } = get();
        if (manualQueue.includes(path)) return;
        set({ manualQueue: [...manualQueue, path] });
      },
      removeManualQueue: (path) => {
        set((s) => ({ manualQueue: s.manualQueue.filter((p) => p !== path) }));
      },
      setManualQueueOrder: (paths) => {
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const p of paths) {
          if (seen.has(p)) continue;
          seen.add(p);
          deduped.push(p);
        }
        set({ manualQueue: deduped });
      },
      clearManualQueue: () => set({ manualQueue: [] }),
      applyManualQueueAdvance: (contextIndex) => {
        set((s) => ({
          manualQueue: s.manualQueue.slice(1),
          playingFromManualQueue: true,
          manualQueueContextIndex: contextIndex,
        }));
      },
      clearManualQueuePlayingState: () => {
        set({ playingFromManualQueue: false, manualQueueContextIndex: null });
      },

      setVolume: (volume) => {
        localStorage.setItem(LS_MINI_VOLUME, volume.toString());
        set({ volume });
      },

      setMuted: (isMuted) => {
        const { volume } = get();
        localStorage.setItem(LS_MINI_VOLUME, volume.toString());
        set({ isMuted });
      },

      setLooping: (isLooping) => {
        const { playingFile } = get();
        if (playingFile) writeLoopForPath(playingFile.path, isLooping);
        localStorage.setItem(LS_MINI_LOOP, isLooping.toString());
        set({ isLooping });
      },

      stopPlayback: () => set({ playingFile: null }),

      handlePlayFile: async (file, playlist) => {
        const mini = await WebviewWindow.getByLabel("mini");
        if (mini) {
          await emitTo("mini", "stop-playback", "main-app");
          try {
            await mini.close();
          } catch (e) {
            console.error("Failed to close mini player", e);
          }
        }

        const prev = get().playingFile;
        const isLooping = readLoopForPath(file.path);
        if (playlist !== undefined) {
          set({
            playingFile: file,
            activeTab: "player",
            folderAudioPlaylist: playlist,
            isLooping,
            playerResumeAt: null,
          });
        } else {
          set({ playingFile: file, activeTab: "player", isLooping, playerResumeAt: null });
        }

        if (prev?.path !== file.path) {
          get().notify(`Now playing: ${file.name}`);
        }
      },

      handlePlayFolderNeighbor: (file) => {
        get().setPlayingFile(file);
      },

      handlePlayPlaylist: (files, shuffle = false) => {
        if (files.length === 0) return;
        const queue = [...files];
        if (shuffle) {
          for (let i = queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue[i], queue[j]] = [queue[j], queue[i]];
          }
        }
        set({
          folderAudioPlaylist: queue,
          playingFile: queue[0],
          activeTab: "player",
        });
        get().notify(
          shuffle ? `Shuffling ${files.length} items` : `Playing ${files.length} items`,
        );
      },

      handlePopOut: async (startTime, opts) => {
        if (get().navMode === "music") {
          return get().handlePopOutMusic(startTime, opts);
        }
        const { playingFile, activeTab, navMode, volume, isMuted } = get();
        const fileToHandoff = playingFile;
        const canHandoff = !!fileToHandoff && (activeTab === "player" || navMode === "music");
        const t = Math.max(0, startTime ?? 0);
        const paused = opts?.paused ?? false;
        const speed = opts?.playbackSpeed ?? readPlaybackSpeed();
        try {
          await invoke("open_mini_player");
          if (canHandoff && fileToHandoff) {
            writePlaybackPos(fileToHandoff.path, t);
            const playInMiniPayload: PlayInMiniPayload = {
              file: fileToHandoff,
              startTime: t,
              paused,
              playbackSpeed: speed,
              volume,
              muted: isMuted,
              navMode,
            };
            await emit("play-in-mini", playInMiniPayload);
            let unlistenFn: (() => void) | null = null;
            listen("mini-player-ready", () => {
              void emit("play-in-mini", playInMiniPayload);
              if (unlistenFn) {
                unlistenFn();
                unlistenFn = null;
              }
            }).then((f) => {
              unlistenFn = f;
            });
            setTimeout(() => {
              if (unlistenFn) {
                unlistenFn();
                unlistenFn = null;
              }
            }, 5000);
            set({
              playingFile: null,
              ...(navMode !== "music" ? { activeTab: "media" } : {}),
            });
          }
        } catch (e) {
          console.error(e);
        }
      },

      handlePopOutMusic: async (startTime, opts) => {
        const {
          playingFile,
          volume,
          isMuted,
          isLooping,
          entries,
          folderAudioPlaylist,
          manualQueue,
          playingFromManualQueue,
          manualQueueContextIndex,
        } = get();
        const fileToHandoff = playingFile;
        if (!fileToHandoff) return;
        const t = Math.max(0, startTime ?? 0);
        const paused = opts?.paused ?? false;
        const speed = opts?.playbackSpeed ?? readPlaybackSpeed();

        const queueSnapshot = buildMusicEffectivePlaylist(
          fileToHandoff,
          folderAudioPlaylist,
          entries,
        );
        const foundIndex = musicEffectivePlaylistIndex(queueSnapshot, fileToHandoff);
        const queueIndex = playingFromManualQueue
          ? (manualQueueContextIndex ?? (foundIndex >= 0 ? foundIndex : 0))
          : foundIndex >= 0
            ? foundIndex
            : 0;

        const payload: PlayInMusicMiniPayload = {
          file: fileToHandoff,
          startTime: t,
          paused,
          playbackSpeed: speed,
          volume,
          muted: isMuted,
          queueSnapshot,
          queueIndex,
          isLooping,
          manualQueue: [...manualQueue],
          playingFromManualQueue,
          manualQueueContextIndex,
        };

        try {
          writePlaybackPos(fileToHandoff.path, t);
          set({ playingFile: null });
          await invoke("open_music_mini_player");
          await emitTo("music-mini", "play-in-music-mini", payload);
          let unlistenFn: (() => void) | null = null;
          listen("music-mini-ready", () => {
            void emitTo("music-mini", "play-in-music-mini", payload);
            if (unlistenFn) {
              unlistenFn();
              unlistenFn = null;
            }
          }).then((f) => {
            unlistenFn = f;
          });
          setTimeout(() => {
            if (unlistenFn) {
              unlistenFn();
              unlistenFn = null;
            }
          }, 5000);
        } catch (e) {
          console.error(e);
        }
      },

      updateSetting: async (key, value) => {
        const resolvedValue =
          key === "maxConcurrentDownloads"
            ? clampMaxConcurrentDownloads(value)
            : value;

        set((s) => ({
          settings: {
            ...s.settings,
            [key]: resolvedValue as RuforgeSettings[typeof key],
          },
          ...(key === "maxConcurrentDownloads"
            ? { maxConcurrentDownloads: resolvedValue as number }
            : {}),
        }));

        if (key === "maxConcurrentDownloads") {
          get().pumpDownloadQueue();
        }

        if (
          key === "downloadSubtitles" ||
          key === "downloadSubtitleLangs" ||
          key === "autoDownloadScrubberPreviews"
        ) {
          get().syncQueuedJobMediaOptionsFromSettings();
        }

        if (key === "minimizeToTray") {
          await invoke("update_tray_config", { minimize: resolvedValue });
        }

        if (key === "launchAtStartup") {
          try {
            if (resolvedValue) await enable();
            else await disable();
          } catch (e) {
            console.error("Failed to update autostart:", e);
          }
        }

        if (key === "hardwareAcceleration") {
          try {
            await invoke("set_hardware_acceleration_pref", {
              hardwareAcceleration: resolvedValue,
            });
            await relaunch();
          } catch (e) {
            console.error("Failed to update hardware acceleration preference:", e);
          }
        }

        if (key === "debugLogEnabledCategories") {
          try {
            await invoke("sync_debug_log_categories", {
              enabled: resolvedValue,
            });
          } catch (e) {
            console.error("Failed to sync debug log categories:", e);
          }
        }
      },

      mergeHardwareAccelerationFromBackend: (hw) => {
        const { settings } = get();
        if (settings.hardwareAcceleration === hw) return;
        set({ settings: { ...settings, hardwareAcceleration: hw } });
      },

      setOutputDir: (dir) => {
        set({ outputDir: dir });
      },

      addLibraryScanDir: (dir) => {
        const trimmed = dir.trim();
        if (!trimmed) return;
        const { libraryScanDirs } = get();
        if (isDirInLibraryScanList(trimmed, libraryScanDirs)) return;
        const next = [...libraryScanDirs, trimmed];
        writeLibraryScanDirsToLs(next);
        set({ libraryScanDirs: next });
        void get().fetchEntries({ manageLoadingStart: false });
      },

      removeLibraryScanDir: (dir) => {
        const key = normalizeScanDirKey(dir);
        const next = get().libraryScanDirs.filter((d) => normalizeScanDirKey(d) !== key);
        writeLibraryScanDirsToLs(next);
        set({ libraryScanDirs: next });
        void get().fetchEntries({ manageLoadingStart: false });
      },

      handleSetSaveToInternal: (val) => {
        set({ saveToInternal: val });
      },

      toggleSidebar: () => {
        set((s) => {
          const next = !s.isSidebarExpanded;
          localStorage.setItem("ruforge-sidebar-expanded", next.toString());
          return { isSidebarExpanded: next };
        });
      },

      setSidebarCollapsedByResize: () => {
        set({ isSidebarExpanded: false });
      },

      cycleNavMode: () => {
        set((s) => {
          const next = nextNavMode(s.navMode);
          localStorage.setItem("ruforge-nav-mode", next);
          return { navMode: next, musicDetail: null };
        });
      },

      setNavMode: (mode) => {
        localStorage.setItem("ruforge-nav-mode", mode);
        set({ navMode: mode, musicDetail: null });
      },

      setMusicView: (view) => set({ musicView: view, musicDetail: null }),
      openMusicArtist: (key) => set({ musicDetail: { kind: "artist", key } }),
      openMusicAlbum: (artistKey, key) => set({ musicDetail: { kind: "album", artistKey, key } }),
      openMusicSong: (path) => set({ musicDetail: { kind: "song", path } }),
      closeMusicDetail: () => set({ musicDetail: null }),

      refreshStorageStats: async () => {
        const { saveToInternal, outputDir } = get();
        try {
          const dir = saveToInternal ? RUFORGE_INTERNAL_DIR : outputDir;
          const stats = await invoke<{ total_bytes: number; file_count: number }>("get_storage_stats", { dir });
          set({ storageStats: stats });
        } catch (e) {
          console.error("Failed to get storage stats", e);
        }
      },

      openAuthorizeCleanupModal: async () => {
        const { saveToInternal, fetchEntries } = get();
        if (!saveToInternal) return;
        if (get().entries.length === 0) {
          await fetchEntries({ manageLoadingStart: false });
        }
        set({ cleanupModalOpen: true });
      },

      closeAuthorizeCleanupModal: () => set({ cleanupModalOpen: false }),

      openExportPanel: (preset) => {
        const { exportInFlight } = get();
        if (exportInFlight) {
          set({ exportPanelOpen: true, exportPanelPreset: preset });
          return;
        }
        set({
          exportPanelOpen: true,
          exportPanelPreset: preset,
          exportOutcome: null,
          exportProgress: null,
        });
      },
      closeExportPanel: () => set({ exportPanelOpen: false }),
      setExportInFlight: (exportInFlight) => set({ exportInFlight }),
      setExportProgress: (exportProgress) => set({ exportProgress }),
      setExportOutcome: (exportOutcome) => set({ exportOutcome }),
      resetExportOutcome: () => set({ exportOutcome: null, exportProgress: null }),

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSettingsTab: (tab) => set({ settingsTab: tab }),
      setGalleryFilter: (f) => set({ galleryFilter: f }),
      setSelectedPlaylist: (p) => set({ selectedPlaylist: p }),
      setIsSearchExpanded: (v) =>
        set((s) => ({
          isSearchExpanded: typeof v === "function" ? v(s.isSearchExpanded) : v,
        })),
      setSearchValue: (v) => set({ searchValue: v }),
      setLastExplorerUrl: (url) => set({ lastExplorerUrl: url }),
      setYoutubeExplorerProfile: (youtubeExplorerProfile) => set({ youtubeExplorerProfile }),

      notify: (message, type = "info") => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        set((s) => ({ notifications: [...s.notifications, { id, message, type }] }));
        if (type === "info" || type === "warning") {
          const handle = setTimeout(() => {
            get().dismissNotification(id);
          }, 4000);
          notificationDismissTimers.set(id, handle);
        } else if (type === "error") {
          const handle = setTimeout(() => {
            get().dismissNotification(id);
          }, 10000);
          notificationDismissTimers.set(id, handle);
        }
        return id;
      },

      dismissNotification: (id) => {
        forgetNotificationDismissTimer(id);
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        }));
      },

      setDownloaderUrl: (url) => set({ url }),
      setDownloaderDuplicateDialogOpen: (downloaderDuplicateDialogOpen) =>
        set({ downloaderDuplicateDialogOpen }),
      setDownloaderMetadataLoading: (metadataLoading) => set({ metadataLoading }),
      setDownloading: (downloading) => set({ downloading }),
      setDownloadProgress: (progress) => set({ progress }),
      setVideoInfo: (videoInfo, meta) =>
        set((state) => ({
          videoInfo: videoInfo === null ? null : sanitizeVideoInfo(videoInfo),
          videoInfoUrl:
            videoInfo === null
              ? null
              : meta?.sourceUrl !== undefined
                ? meta.sourceUrl.trim() || null
                : state.videoInfoUrl,
          videoInfoPreferredQuality:
            videoInfo === null
              ? null
              : meta?.preferredQuality !== undefined
                ? meta.preferredQuality
                : state.videoInfoPreferredQuality,
        })),
      setMetadataError: (metadataError) => set({ metadataError }),
      setDownloaderUrlFocused: (isFocused) => set({ isFocused }),
      resetDownloader: () =>
        set({
          url: "",
          downloaderDuplicateDialogOpen: false,
          metadataLoading: false,
          downloading: false,
          progress: null,
          videoInfo: null,
          videoInfoUrl: null,
          videoInfoPreferredQuality: null,
          metadataError: null,
          isFocused: false,
          focusedJobId: null,
        }),

      fetchEntries: async (opts) => {
        const myToken = ++galleryFetchToken;
        const manageLoadingStart = opts?.manageLoadingStart !== false;
        const skipPosterBackfill = opts?.skipPosterBackfill === true;
        const posterEpoch =
          opts?.posterEpoch ??
          (skipPosterBackfill ? galleryPosterEpoch : (++galleryPosterEpoch, galleryPosterEpoch));
        const { libraryScanDirs, notify } = get();
        if (manageLoadingStart) set({ galleryLoading: true });
        let backfillList: MediaFile[] | null = null;
        try {
          const dirs = galleryScanRoots(libraryScanDirs);
          const scans = await Promise.all(dirs.map((d) => invoke<GalleryEntry[]>("scan_gallery", { dir: d })));
          const combined = scans.flat();
          const unique = dedupeGalleryEntriesCombined(
            combined.filter(
              (entry, index, self) => index === self.findIndex((t) => t.path === entry.path),
            ),
          );
          if (myToken !== galleryFetchToken) return;
          if (galleryPosterEpoch !== posterEpoch) return;
          set((s) => ({
            entries: unique,
            libraryScanRevision: s.libraryScanRevision + 1,
          }));
          if (!skipPosterBackfill) {
            const mediaFiles = unique.flatMap((e) =>
              e.kind === "media" ? [e as MediaFile] : (e as PlaylistCollection).items,
            );
            const need = filesMissingPoster(mediaFiles);
            if (need.length > 0) backfillList = need;
          }
        } catch (e) {
          console.error(e);
          if (myToken === galleryFetchToken) notify("Failed to load video library.");
        } finally {
          if (myToken === galleryFetchToken) set({ galleryLoading: false });
        }

        if (backfillList) {
          void (async () => {
            await ensurePostersForFiles(backfillList!);
            if (myToken !== galleryFetchToken) return;
            if (galleryPosterEpoch !== posterEpoch) return;
            await get().fetchEntries({
              manageLoadingStart: false,
              skipPosterBackfill: true,
              posterEpoch,
            });
          })();
        }
      },

      invalidateEntries: async (opts) => {
        if (!opts?.silent) set({ galleryLoading: true });
        await get().fetchEntries({ manageLoadingStart: false, skipPosterBackfill: false });
      },

      setGalleryActiveMenu: (activeMenu) => set({ activeMenu }),
      setGalleryExtractingPath: (path) =>
        set({
          extractingByPath: path ? { [path]: true } : {},
        }),
    }),
    {
      name: "ruforge-main",
      storage: createRuforgePersistStorage(),
      partialize: (s): RuforgePersistedSubset => ({
        settings: s.settings,
        outputDir: s.outputDir,
        saveToInternal: s.saveToInternal,
        libraryScanDirs: s.libraryScanDirs,
      }),
      /** Must match `version` returned from `getItem` in `createRuforgePersistStorage` (both 0). */
      version: 0,
      /**
       * Runs once after rehydration. With synchronous `getItem`, hydration finishes during
       * `create()` before React mounts — so tray/autostart `invoke` fire at store init time,
       * not in a post-mount effect. That is intentional (single sync from persisted prefs);
       * Tauri IPC is available here in the normal Vite+Tauri bootstrap order.
       */
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error || !state) return;
          const mc = clampMaxConcurrentDownloads(state.settings.maxConcurrentDownloads);
          useRuforgeStore.setState({
            maxConcurrentDownloads: mc,
            settings: {
              ...DEFAULT_SETTINGS,
              ...state.settings,
              maxConcurrentDownloads: mc,
              autoDownloadPlayingSongs: state.settings.autoDownloadPlayingSongs !== false,
            },
          });
          void (async () => {
            await invoke("update_tray_config", { minimize: state.settings.minimizeToTray });
            try {
              const enabled = await isEnabled();
              if (enabled !== state.settings.launchAtStartup) {
                if (state.settings.launchAtStartup) await enable();
                else await disable();
              }
            } catch (e) {
              console.error("Autostart sync failed:", e);
            }
          })();
        };
      },
    },
  ),
);

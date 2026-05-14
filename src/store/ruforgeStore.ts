import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import type { GalleryEntry, MediaFile, PlaylistCollection, ProgressPayload, VideoInfo } from "../types";
import { ensurePostersForFiles, filesMissingPoster } from "../posterBackfill";
import {
  DEFAULT_SETTINGS,
  LS_MINI_LOOP,
  LS_MINI_VOLUME,
  RUFORGE_INTERNAL_DIR,
  readInitialPathsFromLs,
  readInitialPlayerLoopFromLs,
  readInitialPlayerVolumeFromLs,
  type ActiveTab,
  type GalleryFilter,
  type RuforgeSettings,
  type SettingsTab,
} from "./types";
import {
  createRuforgePersistStorage,
  type RuforgePersistedSubset,
} from "./ruforgePersistStorage";

export type {
  ActiveTab,
  GalleryFilter,
  RuforgeSettings,
  SettingsTab,
} from "./types";
export { RUFORGE_INTERNAL_DIR } from "./types";

export type RuforgeNotification = {
  id: number;
  message: string;
  type?: "info" | "update" | "error" | "progress";
  updateObj?: { downloadAndInstall: () => Promise<void> };
};

export type GalleryContextMenuState = { path: string; x: number; y: number } | null;

export interface RuforgeStore {
  settings: RuforgeSettings;
  outputDir: string;
  saveToInternal: boolean;
  isSidebarExpanded: boolean;
  storageStats: { total_bytes: number; file_count: number } | null;

  activeTab: ActiveTab;
  settingsTab: SettingsTab;
  galleryFilter: GalleryFilter;
  selectedPlaylist: PlaylistCollection | null;
  isSearchExpanded: boolean;
  searchValue: string;
  lastExplorerUrl: string;

  notifications: RuforgeNotification[];

  /** Downloader slice (not persisted). */
  url: string;
  metadataLoading: boolean;
  downloading: boolean;
  progress: ProgressPayload | null;
  videoInfo: VideoInfo | null;
  metadataError: string | null;
  isFocused: boolean;

  /** Gallery slice (not persisted). Library list matches `MediaView` / `scan_gallery` shape. */
  entries: GalleryEntry[];
  galleryLoading: boolean;
  extractingByPath: Record<string, boolean>;
  activeMenu: GalleryContextMenuState;

  /** Main-window player; `volume` / `isLooping` mirror flat LS keys read by MiniPlayer. */
  playingFile: MediaFile | null;
  folderAudioPlaylist: MediaFile[];
  volume: number;
  isMuted: boolean;
  isLooping: boolean;

  setPlayingFile: (file: MediaFile | null) => void;
  setFolderAudioPlaylist: (files: MediaFile[]) => void;
  setVolume: (v: number) => void;
  setMuted: (muted: boolean) => void;
  setLooping: (loop: boolean) => void;
  stopPlayback: () => void;

  handlePlayFile: (file: MediaFile, playlist?: MediaFile[]) => Promise<void>;
  handlePlayFolderNeighbor: (file: MediaFile) => void;
  handlePlayPlaylist: (files: MediaFile[], shuffle?: boolean) => void;
  handlePopOut: (startTime?: number) => Promise<void>;

  updateSetting: (key: keyof RuforgeSettings, value: RuforgeSettings[keyof RuforgeSettings]) => Promise<void>;
  mergeHardwareAccelerationFromBackend: (hw: boolean) => void;

  setOutputDir: (dir: string) => void;
  handleSetSaveToInternal: (val: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsedByResize: () => void;
  refreshStorageStats: () => Promise<void>;
  handleAuthorizeCleanup: () => Promise<void>;

  setActiveTab: (tab: ActiveTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setGalleryFilter: (f: GalleryFilter) => void;
  setSelectedPlaylist: (p: PlaylistCollection | null) => void;
  setIsSearchExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  setSearchValue: (v: string) => void;
  setLastExplorerUrl: (url: string) => void;

  notify: (message: string, type?: RuforgeNotification["type"], updateObj?: RuforgeNotification["updateObj"]) => number;
  dismissNotification: (id: number) => void;

  setDownloaderUrl: (url: string) => void;
  setDownloaderMetadataLoading: (v: boolean) => void;
  setDownloading: (v: boolean) => void;
  setDownloadProgress: (p: ProgressPayload | null) => void;
  setVideoInfo: (info: VideoInfo | null) => void;
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
  invalidateEntries: () => Promise<void>;
  setGalleryActiveMenu: (menu: GalleryContextMenuState) => void;
  setGalleryExtractingPath: (path: string | null) => void;
}

/** Monotonic token: only the latest `fetchEntries` run may write `entries` or clear `galleryLoading`. */
let galleryFetchToken = 0;

/** Serial for poster backfill so stale async work cannot chain a second scan after navigation. */
let galleryPosterEpoch = 0;

const pathsInit = readInitialPathsFromLs();
const playerInitVolume = readInitialPlayerVolumeFromLs();
const playerInitLoop = readInitialPlayerLoopFromLs();

export const useRuforgeStore = create<RuforgeStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      outputDir: pathsInit.outputDir,
      saveToInternal: pathsInit.saveToInternal,
      isSidebarExpanded: pathsInit.isSidebarExpanded,
      storageStats: null,

      activeTab: "downloader",
      settingsTab: "general",
      galleryFilter: "all",
      selectedPlaylist: null,
      isSearchExpanded: false,
      searchValue: "",
      lastExplorerUrl: "https://www.youtube.com",

      notifications: [],

      url: "",
      metadataLoading: false,
      downloading: false,
      progress: null,
      videoInfo: null,
      metadataError: null,
      isFocused: false,

      entries: [],
      galleryLoading: true,
      extractingByPath: {},
      activeMenu: null,

      playingFile: null,
      folderAudioPlaylist: [],
      volume: playerInitVolume,
      isMuted: false,
      isLooping: playerInitLoop,

      setPlayingFile: (playingFile) => set({ playingFile }),
      setFolderAudioPlaylist: (folderAudioPlaylist) => set({ folderAudioPlaylist }),

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
        localStorage.setItem(LS_MINI_LOOP, isLooping.toString());
        set({ isLooping });
      },

      stopPlayback: () => set({ playingFile: null }),

      handlePlayFile: async (file, playlist) => {
        const mini = await WebviewWindow.getByLabel("mini");
        if (mini) await emitTo("mini", "play-media", file);

        const prev = get().playingFile;
        if (playlist !== undefined) {
          set({ playingFile: file, activeTab: "player", folderAudioPlaylist: playlist });
        } else {
          set({ playingFile: file, activeTab: "player" });
        }

        await emit("stop-playback", "main-app");

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

      handlePopOut: async (startTime) => {
        const { playingFile, activeTab } = get();
        const fileToHandoff = playingFile;
        const wasInPlayer = activeTab === "player" && !!fileToHandoff;
        try {
          await invoke("open_mini_player");
          if (wasInPlayer && fileToHandoff) {
            const t = startTime ?? 0;
            const playInMiniPayload = { file: fileToHandoff, startTime: t };
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
            set({ playingFile: null, activeTab: "media" });
          }
        } catch (e) {
          console.error(e);
        }
      },

      updateSetting: async (key, value) => {
        set((s) => ({
          settings: { ...s.settings, [key]: value },
        }));

        if (key === "minimizeToTray") {
          await invoke("update_tray_config", { minimize: value });
        }

        if (key === "launchAtStartup") {
          try {
            if (value) await enable();
            else await disable();
          } catch (e) {
            console.error("Failed to update autostart:", e);
          }
        }

        if (key === "hardwareAcceleration") {
          try {
            await invoke("set_hardware_acceleration_pref", {
              hardwareAcceleration: value,
            });
            await relaunch();
          } catch (e) {
            console.error("Failed to update hardware acceleration preference:", e);
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

      handleAuthorizeCleanup: async () => {
        const { saveToInternal, refreshStorageStats, notify } = get();
        if (!saveToInternal) return;
        try {
          const targetFree = 2 * 1024 * 1024 * 1024;
          const deleted = await invoke<number>("authorize_cleanup", {
            dir: RUFORGE_INTERNAL_DIR,
            target_free_bytes: targetFree,
          });
          notify(`Freed ${(deleted / (1024 * 1024 * 1024)).toFixed(1)}GB.`);
          await refreshStorageStats();
        } catch (e) {
          console.error("Cleanup failed", e);
          notify("Cleanup failed.");
        }
      },

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

      notify: (message, type = "info", updateObj) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        set((s) => ({ notifications: [...s.notifications, { id, message, type, updateObj }] }));
        if (type === "info") {
          setTimeout(() => {
            get().dismissNotification(id);
          }, 4000);
        } else if (type === "error") {
          setTimeout(() => {
            get().dismissNotification(id);
          }, 10000);
        }
        return id;
      },

      dismissNotification: (id) => {
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        }));
      },

      setDownloaderUrl: (url) => set({ url }),
      setDownloaderMetadataLoading: (metadataLoading) => set({ metadataLoading }),
      setDownloading: (downloading) => set({ downloading }),
      setDownloadProgress: (progress) => set({ progress }),
      setVideoInfo: (videoInfo) => set({ videoInfo }),
      setMetadataError: (metadataError) => set({ metadataError }),
      setDownloaderUrlFocused: (isFocused) => set({ isFocused }),
      resetDownloader: () =>
        set({
          url: "",
          metadataLoading: false,
          downloading: false,
          progress: null,
          videoInfo: null,
          metadataError: null,
          isFocused: false,
        }),

      fetchEntries: async (opts) => {
        const myToken = ++galleryFetchToken;
        const manageLoadingStart = opts?.manageLoadingStart !== false;
        const skipPosterBackfill = opts?.skipPosterBackfill === true;
        const posterEpoch =
          opts?.posterEpoch ??
          (skipPosterBackfill ? galleryPosterEpoch : (++galleryPosterEpoch, galleryPosterEpoch));
        const { outputDir, notify } = get();
        if (manageLoadingStart) set({ galleryLoading: true });
        let backfillList: MediaFile[] | null = null;
        try {
          const dirs = [RUFORGE_INTERNAL_DIR, outputDir].filter((d) => d && d.trim() !== "");
          const scans = await Promise.all(dirs.map((d) => invoke<GalleryEntry[]>("scan_gallery", { dir: d })));
          const combined = scans.flat();
          const unique = combined.filter(
            (entry, index, self) => index === self.findIndex((t) => t.path === entry.path),
          );
          if (myToken !== galleryFetchToken) return;
          if (galleryPosterEpoch !== posterEpoch) return;
          set({ entries: unique });
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

      invalidateEntries: async () => {
        set({ galleryLoading: true });
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

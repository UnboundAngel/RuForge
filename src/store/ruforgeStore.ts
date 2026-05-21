import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { sanitizeVideoInfo } from "../components/downloader/downloaderFormat";
import type { GalleryEntry, MediaFile, PlaylistCollection, ProgressPayload, VideoInfo } from "../types";
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
  type ActiveTab,
  type GalleryFilter,
  type RuforgeSettings,
  type SettingsTab,
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
import type { PlayInMiniPayload } from "../playerHandoff";
import { writePlaybackPos } from "../playbackStorage";
import { dedupeGalleryEntriesCombined } from "../galleryDedupe";

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
  type?: "info" | "error" | "progress" | "warning";
};

export type GalleryContextMenuState = { path: string; x: number; y: number } | null;

export interface RuforgeStore extends DownloadQueueSlice {
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
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  /** One-shot resume position (seconds) after mini → main handoff. */
  playerResumeAt: number | null;
  cleanupModalOpen: boolean;

  setPlayingFile: (file: MediaFile | null) => void;
  clearPlayerResumeAt: () => void;
  setFolderAudioPlaylist: (files: MediaFile[]) => void;
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

  updateSetting: (key: keyof RuforgeSettings, value: RuforgeSettings[keyof RuforgeSettings]) => Promise<void>;
  mergeHardwareAccelerationFromBackend: (hw: boolean) => void;

  setOutputDir: (dir: string) => void;
  handleSetSaveToInternal: (val: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsedByResize: () => void;
  refreshStorageStats: () => Promise<void>;
  openAuthorizeCleanupModal: () => Promise<void>;
  closeAuthorizeCleanupModal: () => void;

  setActiveTab: (tab: ActiveTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setGalleryFilter: (f: GalleryFilter) => void;
  setSelectedPlaylist: (p: PlaylistCollection | null) => void;
  setIsSearchExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  setSearchValue: (v: string) => void;
  setLastExplorerUrl: (url: string) => void;

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
      volume: playerInitVolume,
      isMuted: false,
      isLooping: playerInitLoop,
      playerResumeAt: null,
      cleanupModalOpen: false,

      setPlayingFile: (playingFile) => {
        const isLooping = playingFile ? readLoopForPath(playingFile.path) : false;
        set({ playingFile, isLooping });
      },
      clearPlayerResumeAt: () => set({ playerResumeAt: null }),
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
        const { playingFile, activeTab, volume, isMuted } = get();
        const fileToHandoff = playingFile;
        const wasInPlayer = activeTab === "player" && !!fileToHandoff;
        const t = Math.max(0, startTime ?? 0);
        const paused = opts?.paused ?? false;
        const speed = opts?.playbackSpeed ?? readPlaybackSpeed();
        try {
          await invoke("open_mini_player");
          if (wasInPlayer && fileToHandoff) {
            writePlaybackPos(fileToHandoff.path, t);
            const playInMiniPayload: PlayInMiniPayload = {
              file: fileToHandoff,
              startTime: t,
              paused,
              playbackSpeed: speed,
              volume,
              muted: isMuted,
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
            set({ playingFile: null, activeTab: "media" });
          }
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

      openAuthorizeCleanupModal: async () => {
        const { saveToInternal, fetchEntries } = get();
        if (!saveToInternal) return;
        if (get().entries.length === 0) {
          await fetchEntries({ manageLoadingStart: false });
        }
        set({ cleanupModalOpen: true });
      },

      closeAuthorizeCleanupModal: () => set({ cleanupModalOpen: false }),

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
        const { outputDir, notify } = get();
        if (manageLoadingStart) set({ galleryLoading: true });
        let backfillList: MediaFile[] | null = null;
        try {
          const dirs = [RUFORGE_INTERNAL_DIR, outputDir].filter((d) => d && d.trim() !== "");
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
            settings: { ...state.settings, maxConcurrentDownloads: mc },
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

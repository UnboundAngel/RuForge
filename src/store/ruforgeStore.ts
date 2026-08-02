import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { sanitizeVideoInfo } from "../components/downloader/downloaderFormat";
import type { GalleryEntry, MediaFile, PlaylistCollection, ProgressPayload, VideoInfo } from "../types";
import {
  galleryScanRootsFromStore,
  hydrateLibraryFromRust,
  isDirInLibraryScanList,
  libraryConfigToStoreFields,
  normalizeScanDirKey,
  type LibraryConfig,
} from "../lib/libraryConfig";
import {
  noteGalleryFetchStart,
  runEnsureGalleryOnViewMount,
  tryJoinColdGalleryFetch,
} from "./galleryColdFetch";
import { ensurePostersForFiles, filesMissingPoster } from "../posterBackfill";
import {
  removePathFromGalleryEntries,
  upsertMediaIntoGalleryEntries,
} from "../galleryEntries";
import { flattenGalleryScanToMediaFiles } from "../galleryScan";
import {
  ensureScrubSpritesForFiles,
  topNScrubBackfillCandidates,
} from "../scrubSpriteBackfill";
import { mediaPathsMatch } from "../lib/mediaPathMatch";
import {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_SETTINGS,
  LS_MINI_VOLUME,
  RUFORGE_INTERNAL_DIR,
  clampMaxConcurrentDownloads,
  readInitialPathsFromLs,
  readInitialPlayerLoopModeFromLs,
  readInitialPlayerVolumeFromLs,
  writePlayerLoopModeToLs,
  nextNavMode,
  type ActiveTab,
  type GalleryFilter,
  type LoopMode,
  type MusicDetail,
  type MusicView,
  type NavMode,
  type RuforgeSettings,
  type SettingsTab,
  type YouTubeExplorerProfile,
  type YoutubeSessionStatus,
} from "./types";
import { hydrateYoutubeProfileSession } from "../lib/youtubeProfileSession";
import {
  createRuforgePersistStorage,
  type RuforgePersistedSubset,
} from "./ruforgePersistStorage";
import { loadInitialDownloadQueueState } from "../downloadQueue";
import {
  createDownloadQueueSlice,
  type DownloadQueueSlice,
} from "./downloadQueueSlice";
import {
  cycleLoopMode,
  readLoopModeForPath,
  resolveLoopModeForPlay,
  writeLoopModeForPath,
} from "../playbackLoopStorage";
import {
  loadLikedIdentityKeys,
  toggleTrackLike,
} from "../components/music/musicLikedTracks";
import { buildSmartShuffleOrder } from "../components/music/musicSmartShuffle";
import type { MusicQueueSource } from "../components/music/musicQueueSource";
import { isAudioOnlyPath } from "../mediaKind";
import {
  claimMainPlayback,
  closeVideoMiniWindow,
} from "../lib/mainPlaybackClaim";
import {
  getActiveListenEventId,
  transferListenSession,
} from "../lib/musicListenSession";
import { readPlaybackSpeed } from "../playbackSpeedStorage";
import type { PlayInMiniPayload, PlayInMusicMiniPayload } from "../playerHandoff";
import { writePlaybackPos } from "../playbackStorage";
import { parkAndStopVideoPlayback } from "../lib/videoPlaybackPark";
import {
  buildMusicEffectivePlaylist,
  musicEffectivePlaylistIndex,
} from "../lib/musicHandoffQueue";
import type {
  ExportBundleProgressPayload,
  ExportOutcome,
  ExportPanelPreset,
} from "../lib/exportTypes";
import type { ActivityHandoffSnapshot, ActivityOwner } from "../lib/activityTypes";

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

export type GalleryContextMenuState = {
  path: string;
  x?: number;
  y?: number;
  /** Playlist (and legacy) floating popover. Media cards use in-card Morph instead. */
  floating?: boolean;
} | null;

export interface RuforgeStore extends DownloadQueueSlice {
  settings: RuforgeSettings;
  outputDir: string;
  saveToInternal: boolean;
  /** Rust-owned internal vault path (always scanned). */
  internalVault: string;
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
  /** 0–1 Video Library tab chrome reveal (throttled from MediaView scroll; not raw scrollTop). */
  galleryScrollChrome: number;
  selectedPlaylist: PlaylistCollection | null;
  isSearchExpanded: boolean;
  searchValue: string;
  lastExplorerUrl: string;
  youtubeSessionStatus: YoutubeSessionStatus;
  /** Display profile (live probe or cache); null when signed-out. */
  youtubeExplorerProfile: YouTubeExplorerProfile | null;

  notifications: RuforgeNotification[];

  /** Downloader slice (not persisted). */
  url: string;
  /** Where the hero URL last came from (paste vs explorer add). */
  urlSourceHint: "clipboard" | "explorer" | null;
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

  /** Gallery slice (not persisted). Library list from Rust `get_library_snapshot`. */
  entries: GalleryEntry[];
  /**
   * Scan roots already passed through `sweep_library_download_duplicates` this app session.
   * Not persisted: each launch may run one full dedupe sweep per root on first `fetchEntries`.
   */
  galleryDedupeSweptRoots: string[];
  /** Bumps when `entries` is replaced from a successful on-disk gallery scan (`fetchEntries`). */
  libraryScanRevision: number;
  galleryLoading: boolean;
  /** True after Rust has published a desktop library snapshot (`LibrarySnapshot.ready`). */
  galleryDesktopReady: boolean;
  extractingByPath: Record<string, boolean>;
  activeMenu: GalleryContextMenuState;

  /** Main-window player; `volume` / `loopMode` mirror flat LS keys read by MiniPlayer. */
  playingFile: MediaFile | null;
  /** Set when playback hands off to a mini webview; drives activity island stub state. */
  activityOwner: ActivityOwner | null;
  activityHandoff: ActivityHandoffSnapshot | null;
  folderAudioPlaylist: MediaFile[];
  /**
   * True after endless autoplay has extended `folderAudioPlaylist`.
   * Blocks using that live list as the endless candidate pool.
   */
  musicEndlessExtended: boolean;
  /**
   * Index in `folderAudioPlaylist` where endless picks begin.
   * Null until the first endless stage/append.
   */
  musicEndlessFromIndex: number | null;
  /**
   * Play-time queue origin for "Next from:" (null = unknown → "Next up").
   * Cleared only by a new user-initiated play or stop; skip/advance keep it.
   */
  musicQueueSource: MusicQueueSource | null;
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
  /** Identity keys for liked tracks (`musicLikedTracks` localStorage). */
  musicLikedKeys: string[];
  volume: number;
  isMuted: boolean;
  loopMode: LoopMode;
  /** One-shot resume position (seconds) after mini → main handoff. */
  playerResumeAt: number | null;
  /** Video session parked when music claims playback over in-progress video. */
  parkedVideoFile: MediaFile | null;
  parkedVideoAt: number | null;
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
  setActivityHandoff: (owner: ActivityOwner, snapshot: ActivityHandoffSnapshot) => void;
  syncActivityHandoff: (
    surface: "video-mini" | "music-mini",
    snapshot: ActivityHandoffSnapshot,
  ) => void;
  clearActivityHandoff: () => void;
  clearPlayerResumeAt: () => void;
  clearMusicPlayerResume: () => void;
  setFolderAudioPlaylist: (files: MediaFile[]) => void;
  setMusicQueueSource: (source: MusicQueueSource | null) => void;
  /** Apply an endless stage/append: extend playlist and record endless tail start. */
  applyMusicEndlessAdvance: (
    playlistAfter: MediaFile[],
    endlessFromIndex: number,
  ) => void;
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
  toggleMusicLike: (file: MediaFile) => void;
  setVolume: (v: number) => void;
  setMuted: (muted: boolean) => void;
  setLoopMode: (mode: LoopMode) => void;
  cycleLoopMode: () => void;
  stopPlayback: () => void;

  handlePlayFile: (
    file: MediaFile,
    playlist?: MediaFile[],
    source?: MusicQueueSource | null,
  ) => Promise<void>;
  playMusicQueue: (
    file: MediaFile,
    playlist: MediaFile[],
    source: MusicQueueSource | null,
  ) => void;
  handlePlayFolderNeighbor: (file: MediaFile) => void;
  handlePlayPlaylist: (
    files: MediaFile[],
    shuffle?: boolean,
    source?: MusicQueueSource | null,
  ) => void;
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
  mergeShowDebuggingSettingsFromBackend: (showDebugging: boolean) => void;

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
  openMusicLiked: () => void;
  /** Music mode + listening stats (profile destination for the YouTube account chip). */
  openProfilePage: () => void;
  openMusicStats: () => void;
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
  setGalleryScrollChrome: (n: number) => void;
  setSelectedPlaylist: (p: PlaylistCollection | null) => void;
  setIsSearchExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  setSearchValue: (v: string) => void;
  setLastExplorerUrl: (url: string) => void;
  setYoutubeProfileSession: (session: {
    status: YoutubeSessionStatus;
    profile: YouTubeExplorerProfile | null;
  }) => void;

  notify: (message: string, type?: RuforgeNotification["type"]) => number;
  dismissNotification: (id: number) => void;

  setDownloaderUrl: (url: string) => void;
  setDownloaderUrlSourceHint: (hint: RuforgeStore["urlSourceHint"]) => void;
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
    skipScrubBackfill?: boolean;
    posterEpoch?: number;
    scrubEpoch?: number;
    /** Full-tree duplicate download cleanup before scan (e.g. after library migration). */
    sweepDuplicates?: boolean;
    /**
     * When true and a cold gallery fetch is in flight, join that promise instead of
     * bumping `galleryFetchToken` (used by quiet remounts and `library-changed`).
     */
    joinColdInFlight?: boolean;
    /** Force Rust to walk/reindex instead of serving the published desktop snapshot. */
    forceReindex?: boolean;
  }) => Promise<void>;
  /**
   * Media/Music mount policy: first call this session runs a cold scan with poster/scrub
   * backfill; later mounts serve store data and quiet-reindex without spinner or backfill.
   * `forceCold` (e.g. libraryScanDirs changed) always takes the cold path.
   */
  ensureGalleryOnViewMount: (opts?: { forceCold?: boolean }) => Promise<void>;
  removeGalleryEntryByPath: (path: string) => void;
  upsertGalleryMediaFile: (file: MediaFile) => void;
  invalidateEntries: (opts?: { silent?: boolean; sweepDuplicates?: boolean }) => Promise<void>;
  setGalleryActiveMenu: (menu: GalleryContextMenuState) => void;
  addGalleryExtractingPath: (path: string) => void;
  removeGalleryExtractingPath: (path: string) => void;
  /** @deprecated Prefer add/remove; clears all when null. */
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

let popOutMusicInFlight = false;
let popOutVideoInFlight = false;

const MUSIC_MINI_READY_TIMEOUT_MS = 6000;
const VIDEO_MINI_READY_TIMEOUT_MS = 6000;

function waitForMusicMiniReady(): Promise<void> {
  return new Promise((resolve) => {
    let unlisten: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      unlisten?.();
      resolve();
    }, MUSIC_MINI_READY_TIMEOUT_MS);
    void listen("music-mini-ready", () => {
      window.clearTimeout(timer);
      unlisten?.();
      resolve();
    }).then((f) => {
      unlisten = f;
    });
  });
}

function waitForVideoMiniReadyThen(onReady: () => void | Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    let unlisten: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      unlisten?.();
      resolve();
    }, VIDEO_MINI_READY_TIMEOUT_MS);
    void listen("mini-player-ready", () => {
      window.clearTimeout(timer);
      unlisten?.();
      void Promise.resolve(onReady()).finally(() => resolve());
    }).then((f) => {
      unlisten = f;
    });
  });
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
let galleryScrubEpoch = 0;

let deferredScrubBackfillQueue: MediaFile[] = [];

function playbackBlocksScrubBackfill(state: {
  playingFile: MediaFile | null;
  activeTab: ActiveTab;
}): boolean {
  return state.playingFile !== null || state.activeTab === "player";
}

function queueDeferredScrubBackfill(files: MediaFile[]) {
  const seen = new Set(deferredScrubBackfillQueue.map((f) => f.path));
  for (const f of files) {
    if (!seen.has(f.path)) {
      seen.add(f.path);
      deferredScrubBackfillQueue.push(f);
    }
  }
}

function tryFlushDeferredScrubBackfill(get: () => RuforgeStore) {
  if (playbackBlocksScrubBackfill(get())) return;
  if (deferredScrubBackfillQueue.length === 0) return;
  const list = deferredScrubBackfillQueue;
  deferredScrubBackfillQueue = [];
  void (async () => {
    await ensureScrubSpritesForFiles(list, {
      onEnd: (path) => get().removeGalleryExtractingPath(path),
    });
    await get().fetchEntries({
      manageLoadingStart: false,
      skipPosterBackfill: true,
      skipScrubBackfill: true,
    });
  })();
}

const pathsInit = readInitialPathsFromLs();
const playerInitVolume = readInitialPlayerVolumeFromLs();
const playerInitLoopMode = readInitialPlayerLoopModeFromLs();
const initialDownloadQueue = loadInitialDownloadQueueState();

export const useRuforgeStore = create<RuforgeStore>()(
  persist(
    (set, get, store) => ({
      ...createDownloadQueueSlice(set, get, store),
      downloadJobs: initialDownloadQueue.downloadJobs,
      focusedJobId: initialDownloadQueue.focusedJobId,

      settings: DEFAULT_SETTINGS,
      outputDir: DEFAULT_OUTPUT_DIR,
      saveToInternal: true,
      internalVault: RUFORGE_INTERNAL_DIR,
      libraryScanDirs: [],
      isSidebarExpanded: pathsInit.isSidebarExpanded,
      navMode: pathsInit.navMode,
      musicView: "home",
      musicDetail: null,
      storageStats: null,

      activeTab: "downloader",
      settingsTab: "general",
      galleryFilter: "all",
      galleryScrollChrome: 0,
      selectedPlaylist: null,
      isSearchExpanded: false,
      searchValue: "",
      lastExplorerUrl: "https://www.youtube.com",
      ...(() => {
        const hydrated = hydrateYoutubeProfileSession();
        return {
          youtubeSessionStatus: hydrated.status,
          youtubeExplorerProfile: hydrated.profile,
        };
      })(),

      notifications: [],

      url: "",
      urlSourceHint: null,
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
      galleryDedupeSweptRoots: [],
      libraryScanRevision: 0,
      galleryLoading: true,
      galleryDesktopReady: false,
      extractingByPath: {},
      activeMenu: null,

      playingFile: null,
      activityOwner: null,
      activityHandoff: null,
      folderAudioPlaylist: [],
      musicEndlessExtended: false,
      musicEndlessFromIndex: null,
      musicQueueSource: null,
      manualQueue: [],
      playingFromManualQueue: false,
      manualQueueContextIndex: null,
      musicLikedKeys: loadLikedIdentityKeys(),
      volume: playerInitVolume,
      isMuted: false,
      loopMode: playerInitLoopMode,
      playerResumeAt: null,
      parkedVideoFile: null,
      parkedVideoAt: null,
      musicPlayerResume: null,
      cleanupModalOpen: false,

      exportPanelOpen: false,
      exportPanelPreset: null,
      exportInFlight: false,
      exportProgress: null,
      exportOutcome: null,

      setPlayingFile: (playingFile) => {
        const prev = get().playingFile;
        const loopMode = playingFile
          ? resolveLoopModeForPlay(readLoopModeForPath(playingFile.path), get().loopMode)
          : get().loopMode;

        if (
          playingFile &&
          prev &&
          !isAudioOnlyPath(prev.path) &&
          isAudioOnlyPath(playingFile.path)
        ) {
          const parkedAt = parkAndStopVideoPlayback(prev);
          claimMainPlayback();
          set({
            playingFile,
            loopMode,
            activityOwner: null,
            activityHandoff: null,
            parkedVideoFile: prev,
            parkedVideoAt: parkedAt,
          });
          return;
        }

        if (playingFile) {
          claimMainPlayback();
          const { parkedVideoFile, parkedVideoAt } = get();
          const restoreParkedVideo =
            !isAudioOnlyPath(playingFile.path) &&
            parkedVideoFile?.path === playingFile.path;
          set({
            playingFile,
            loopMode,
            activityOwner: null,
            activityHandoff: null,
            ...(restoreParkedVideo
              ? {
                  playerResumeAt: parkedVideoAt ?? null,
                  parkedVideoFile: null,
                  parkedVideoAt: null,
                }
              : !isAudioOnlyPath(playingFile.path)
                ? { parkedVideoFile: null, parkedVideoAt: null }
                : {}),
          });
        } else {
          set({ playingFile });
          tryFlushDeferredScrubBackfill(get);
        }
      },
      setActivityHandoff: (owner, snapshot) => {
        set({ activityOwner: owner, activityHandoff: snapshot });
      },
      syncActivityHandoff: (surface, snapshot) => {
        if (get().activityOwner !== surface) return;
        set({ activityHandoff: snapshot });
      },
      clearActivityHandoff: () => {
        set({ activityOwner: null, activityHandoff: null });
      },
      clearPlayerResumeAt: () => set({ playerResumeAt: null }),
      clearMusicPlayerResume: () => set({ musicPlayerResume: null }),
      setFolderAudioPlaylist: (folderAudioPlaylist) =>
        set({
          folderAudioPlaylist,
          musicEndlessExtended: false,
          musicEndlessFromIndex: null,
        }),
      setMusicQueueSource: (musicQueueSource) => set({ musicQueueSource }),
      applyMusicEndlessAdvance: (folderAudioPlaylist, endlessFromIndex) =>
        set((s) => ({
          folderAudioPlaylist,
          musicEndlessExtended: true,
          musicEndlessFromIndex: s.musicEndlessFromIndex ?? endlessFromIndex,
        })),

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

      toggleMusicLike: (file) => {
        toggleTrackLike(file);
        set({ musicLikedKeys: loadLikedIdentityKeys() });
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

      setLoopMode: (loopMode) => {
        const { playingFile } = get();
        if (playingFile) writeLoopModeForPath(playingFile.path, loopMode);
        writePlayerLoopModeToLs(loopMode);
        set({ loopMode });
      },
      cycleLoopMode: () => {
        get().setLoopMode(cycleLoopMode(get().loopMode));
      },

      stopPlayback: () => {
        claimMainPlayback();
        set({
          playingFile: null,
          musicQueueSource: null,
          activityOwner: null,
          activityHandoff: null,
          parkedVideoFile: null,
          parkedVideoAt: null,
        });
        tryFlushDeferredScrubBackfill(get);
      },

      handlePlayFile: async (file, playlist, source = null) => {
        await closeVideoMiniWindow();

        const prev = get().playingFile;
        if (playlist !== undefined) {
          set({
            folderAudioPlaylist: playlist,
            musicEndlessExtended: false,
            musicEndlessFromIndex: null,
            musicQueueSource: source ?? null,
            activeTab: "player",
            playerResumeAt: null,
          });
        } else {
          set({
            musicQueueSource: source ?? null,
            activeTab: "player",
            playerResumeAt: null,
          });
        }
        get().setPlayingFile(file);

        if (prev?.path !== file.path) {
          get().notify(`Now playing: ${file.name}`);
        }
      },

      playMusicQueue: (file, playlist, source) => {
        claimMainPlayback();
        const loopMode = resolveLoopModeForPlay(
          readLoopModeForPath(file.path),
          get().loopMode,
        );
        set({
          folderAudioPlaylist: playlist,
          musicEndlessExtended: false,
          musicEndlessFromIndex: null,
          musicQueueSource: source,
          playingFile: file,
          loopMode,
          activityOwner: null,
          activityHandoff: null,
          playerResumeAt: null,
        });
      },

      handlePlayFolderNeighbor: (file) => {
        get().setPlayingFile(file);
      },

      handlePlayPlaylist: (files, shuffle = false, source = null) => {
        if (files.length === 0) return;
        let queue = [...files];
        if (shuffle) {
          if (get().navMode === "music") {
            queue = buildSmartShuffleOrder({
              pool: files,
              likedKeys: get().musicLikedKeys,
              seed: Date.now() & 0xffffffff,
            });
          } else {
            for (let i = queue.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [queue[i], queue[j]] = [queue[j], queue[i]];
            }
          }
        }
        set({
          folderAudioPlaylist: queue,
          musicEndlessExtended: false,
          musicEndlessFromIndex: null,
          musicQueueSource: source ?? null,
          activeTab: "player",
        });
        get().setPlayingFile(queue[0]);
        get().notify(
          shuffle ? `Shuffling ${files.length} items` : `Playing ${files.length} items`,
        );
      },

      handlePopOut: async (startTime, opts) => {
        if (get().navMode === "music") {
          return get().handlePopOutMusic(startTime, opts);
        }
        if (popOutVideoInFlight) {
          return;
        }
        popOutVideoInFlight = true;
        const { playingFile, activeTab, navMode, volume, isMuted } = get();
        const fileToHandoff = playingFile;
        const canHandoff = !!fileToHandoff && (activeTab === "player" || navMode === "music");
        const t = Math.max(0, startTime ?? 0);
        const paused = opts?.paused ?? false;
        const speed = opts?.playbackSpeed ?? readPlaybackSpeed();
        try {
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

            const existingMini = await WebviewWindow.getByLabel("mini");

            get().setActivityHandoff("video-mini", {
              file: fileToHandoff,
              startTime: t,
              paused,
            });
            set({
              playingFile: null,
              ...(navMode !== "music" ? { activeTab: "media" } : {}),
            });

            const emitHandoff = async () => {
              await emitTo("mini", "play-in-mini", playInMiniPayload);
            };

            await invoke("open_mini_player");
            if (existingMini) {
              await emitHandoff();
            } else {
              await waitForVideoMiniReadyThen(emitHandoff);
            }
          } else {
            await invoke("open_mini_player");
          }
        } catch (e) {
          console.error(e);
        } finally {
          popOutVideoInFlight = false;
        }
      },

      handlePopOutMusic: async (startTime, opts) => {
        if (popOutMusicInFlight) return;
        popOutMusicInFlight = true;
        const {
          playingFile,
          volume,
          isMuted,
          loopMode,
          entries,
          folderAudioPlaylist,
          musicEndlessExtended,
          musicEndlessFromIndex,
          musicLikedKeys,
          manualQueue,
          playingFromManualQueue,
          manualQueueContextIndex,
        } = get();
        const fileToHandoff = playingFile;
        if (!fileToHandoff) {
          popOutMusicInFlight = false;
          return;
        }
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
        const libraryAudio = flattenGalleryScanToMediaFiles(entries).filter((f) =>
          isAudioOnlyPath(f.path),
        );

        const payload: PlayInMusicMiniPayload = {
          file: fileToHandoff,
          startTime: t,
          paused,
          playbackSpeed: speed,
          volume,
          muted: isMuted,
          queueSnapshot,
          queueIndex,
          loopMode,
          manualQueue: [...manualQueue],
          playingFromManualQueue,
          manualQueueContextIndex,
          listenEventId: null,
          libraryAudio,
          musicEndlessExtended,
          musicEndlessFromIndex,
          musicLikedKeys: [...musicLikedKeys],
        };

        try {
          const listenEventId = getActiveListenEventId();
          await transferListenSession("music_mini");
          payload.listenEventId = listenEventId;
          writePlaybackPos(fileToHandoff.path, t);

          const existingMini = await WebviewWindow.getByLabel("music-mini");
          const readyWait = existingMini ? null : waitForMusicMiniReady();

          get().setActivityHandoff("music-mini", {
            file: fileToHandoff,
            startTime: t,
            paused,
          });
          set({ playingFile: null });

          await invoke("open_music_mini_player");
          if (readyWait) await readyWait;

          await emitTo("music-mini", "play-in-music-mini", payload);
        } catch (e) {
          console.error(e);
        } finally {
          popOutMusicInFlight = false;
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

        if (key === "showDebuggingSettings") {
          try {
            await invoke("set_show_debugging_settings_pref", {
              showDebuggingSettings: resolvedValue === true,
            });
            await relaunch();
          } catch (e) {
            console.error("Failed to update dev gate preference:", e);
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

      mergeShowDebuggingSettingsFromBackend: (showDebugging) => {
        const { settings } = get();
        if (settings.showDebuggingSettings === showDebugging) return;
        set({ settings: { ...settings, showDebuggingSettings: showDebugging } });
      },

      setOutputDir: (dir) => {
        void (async () => {
          try {
            const cfg = await invoke<LibraryConfig>("library_set_config", {
              patch: { outputDir: dir },
            });
            set(libraryConfigToStoreFields(cfg));
          } catch (e) {
            console.error(e);
            get().notify("Failed to update download path.");
          }
        })();
      },

      addLibraryScanDir: (dir) => {
        const trimmed = dir.trim();
        if (!trimmed) return;
        const { internalVault, libraryScanDirs } = get();
        if (
          isDirInLibraryScanList(trimmed, {
            internalVault,
            extraScanDirs: libraryScanDirs,
          })
        ) {
          return;
        }
        const next = [...libraryScanDirs, trimmed];
        void (async () => {
          try {
            const cfg = await invoke<LibraryConfig>("library_set_config", {
              patch: { extraScanDirs: next },
            });
            set(libraryConfigToStoreFields(cfg));
            void get().fetchEntries({ manageLoadingStart: false });
          } catch (e) {
            console.error(e);
            get().notify("Failed to add library scan folder.");
          }
        })();
      },

      removeLibraryScanDir: (dir) => {
        const key = normalizeScanDirKey(dir);
        const next = get().libraryScanDirs.filter((d) => normalizeScanDirKey(d) !== key);
        void (async () => {
          try {
            const cfg = await invoke<LibraryConfig>("library_set_config", {
              patch: { extraScanDirs: next },
            });
            set(libraryConfigToStoreFields(cfg));
            void get().fetchEntries({ manageLoadingStart: false });
          } catch (e) {
            console.error(e);
            get().notify("Failed to remove library scan folder.");
          }
        })();
      },

      handleSetSaveToInternal: (val) => {
        void (async () => {
          try {
            const cfg = await invoke<LibraryConfig>("library_set_config", {
              patch: { saveToInternal: val },
            });
            set(libraryConfigToStoreFields(cfg));
          } catch (e) {
            console.error(e);
            get().notify("Failed to update storage target.");
          }
        })();
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
      openMusicLiked: () => set({ musicDetail: { kind: "liked" } }),
      openProfilePage: () => {
        localStorage.setItem("ruforge-nav-mode", "music");
        set({
          navMode: "music",
          musicView: "home",
          musicDetail: { kind: "profile" },
        });
      },
      openMusicStats: () => set({ musicDetail: { kind: "stats" } }),
      closeMusicDetail: () => set({ musicDetail: null }),

      refreshStorageStats: async () => {
        const { saveToInternal, outputDir, internalVault } = get();
        try {
          const dir = saveToInternal ? internalVault : outputDir;
          const stats = await invoke<{ total_bytes: number; file_count: number }>("get_storage_stats", { dir });
          set({ storageStats: stats });
        } catch (e) {
          console.error("Failed to get storage stats", e);
        }
      },

      openAuthorizeCleanupModal: async () => {
        const { saveToInternal, fetchEntries } = get();
        if (!saveToInternal) return;
        // Open first; never block the click on a cold gallery scan.
        set({ cleanupModalOpen: true });
        if (get().entries.length === 0) {
          void fetchEntries({
            manageLoadingStart: true,
            skipPosterBackfill: true,
            skipScrubBackfill: true,
          });
        }
        void get().refreshStorageStats();
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

      setActiveTab: (tab) => {
        set({
          activeTab: tab,
          ...(tab !== "media" ? { galleryScrollChrome: 0 } : {}),
        });
        if (tab !== "player") tryFlushDeferredScrubBackfill(get);
      },
      setSettingsTab: (tab) => set({ settingsTab: tab }),
      setGalleryFilter: (f) => set({ galleryFilter: f, galleryScrollChrome: 0 }),
      setGalleryScrollChrome: (n) => {
        const next = Math.min(1, Math.max(0, n));
        if (get().galleryScrollChrome === next) return;
        set({ galleryScrollChrome: next });
      },
      setSelectedPlaylist: (p) => set({ selectedPlaylist: p }),
      setIsSearchExpanded: (v) =>
        set((s) => ({
          isSearchExpanded: typeof v === "function" ? v(s.isSearchExpanded) : v,
        })),
      setSearchValue: (v) => set({ searchValue: v }),
      setLastExplorerUrl: (url) => set({ lastExplorerUrl: url }),
      setYoutubeProfileSession: (session) =>
        set({
          youtubeSessionStatus: session.status,
          youtubeExplorerProfile: session.profile,
        }),

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
      setDownloaderUrlSourceHint: (urlSourceHint) => set({ urlSourceHint }),
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
          urlSourceHint: null,
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
        if (opts?.joinColdInFlight) {
          const joined = tryJoinColdGalleryFetch();
          if (joined) return joined;
        }
        noteGalleryFetchStart();
        const myToken = ++galleryFetchToken;
        const manageLoadingStart = opts?.manageLoadingStart !== false;
        const skipPosterBackfill = opts?.skipPosterBackfill === true;
        const skipScrubBackfill = opts?.skipScrubBackfill === true;
        const posterEpoch =
          opts?.posterEpoch ??
          (skipPosterBackfill ? galleryPosterEpoch : (++galleryPosterEpoch, galleryPosterEpoch));
        const scrubEpoch =
          opts?.scrubEpoch ??
          (skipScrubBackfill ? galleryScrubEpoch : (++galleryScrubEpoch, galleryScrubEpoch));
        const { internalVault, libraryScanDirs, notify, settings } = get();
        if (manageLoadingStart) set({ galleryLoading: true });
        let posterBackfillList: MediaFile[] | null = null;
        let scrubBackfillList: MediaFile[] | null = null;
        try {
          const dirs = galleryScanRootsFromStore({ internalVault, libraryScanDirs });
          const forceSweep = opts?.sweepDuplicates === true;
          const sweptSet = new Set(get().galleryDedupeSweptRoots);
          let sweptRootsUpdated = false;
          for (const dir of dirs) {
            const key = normalizeScanDirKey(dir);
            if (forceSweep || !sweptSet.has(key)) {
              await invoke("sweep_library_download_duplicates", { dir });
              sweptSet.add(key);
              sweptRootsUpdated = true;
            }
          }
          if (sweptRootsUpdated) {
            set({ galleryDedupeSweptRoots: Array.from(sweptSet) });
          }
          const forceReindex =
            opts?.forceReindex === true || opts?.sweepDuplicates === true;
          const snapshot = await invoke<{
            version: string;
            ready: boolean;
            entries: GalleryEntry[];
          }>("get_library_snapshot", { force: forceReindex });
          const unique = snapshot.entries;
          if (myToken !== galleryFetchToken) return;
          if (galleryPosterEpoch !== posterEpoch || galleryScrubEpoch !== scrubEpoch) return;
          set((s) => ({
            entries: unique,
            galleryDesktopReady: snapshot.ready,
            libraryScanRevision: s.libraryScanRevision + 1,
          }));
          const mediaFiles = unique.flatMap((e) =>
            e.kind === "media" ? [e as MediaFile] : (e as PlaylistCollection).items,
          );
          if (!skipPosterBackfill) {
            const need = filesMissingPoster(mediaFiles);
            if (need.length > 0) posterBackfillList = need;
          }
          if (!skipScrubBackfill && settings.autoDownloadScrubberPreviews !== false) {
            const need = topNScrubBackfillCandidates(mediaFiles);
            if (need.length > 0) scrubBackfillList = need;
          }
        } catch (e) {
          console.error(e);
          if (myToken === galleryFetchToken) notify("Failed to load video library.");
        } finally {
          if (myToken === galleryFetchToken) set({ galleryLoading: false });
        }

        if (posterBackfillList || scrubBackfillList) {
          const state = get();
          if (scrubBackfillList && playbackBlocksScrubBackfill(state)) {
            queueDeferredScrubBackfill(scrubBackfillList);
            scrubBackfillList = null;
          }
          void (async () => {
            await Promise.all([
              posterBackfillList
                ? ensurePostersForFiles(posterBackfillList)
                : Promise.resolve(),
              scrubBackfillList
                ? ensureScrubSpritesForFiles(scrubBackfillList, {
                    onEnd: (path) => get().removeGalleryExtractingPath(path),
                  })
                : Promise.resolve(),
            ]);
            if (myToken !== galleryFetchToken) return;
            if (galleryPosterEpoch !== posterEpoch || galleryScrubEpoch !== scrubEpoch) return;
            await get().fetchEntries({
              manageLoadingStart: false,
              skipPosterBackfill: true,
              skipScrubBackfill: true,
              posterEpoch,
              scrubEpoch,
            });
          })();
        }
      },

      ensureGalleryOnViewMount: async (opts) => {
        await runEnsureGalleryOnViewMount({
          forceCold: opts?.forceCold,
          fetchEntries: (fetchOpts) => get().fetchEntries(fetchOpts),
        });
      },

      removeGalleryEntryByPath: (path) => {
        galleryFetchToken += 1;
        set((s) => ({
          entries: removePathFromGalleryEntries(s.entries, path),
          libraryScanRevision: s.libraryScanRevision + 1,
          galleryLoading: false,
          galleryDesktopReady: true,
        }));
      },

      upsertGalleryMediaFile: (file) => {
        galleryFetchToken += 1;
        set((s) => ({
          entries: upsertMediaIntoGalleryEntries(s.entries, file),
          libraryScanRevision: s.libraryScanRevision + 1,
          galleryLoading: false,
          galleryDesktopReady: true,
        }));
      },

      invalidateEntries: async (opts) => {
        if (!opts?.silent) set({ galleryLoading: true });
        await get().fetchEntries({
          manageLoadingStart: false,
          skipPosterBackfill: false,
          sweepDuplicates: opts?.sweepDuplicates,
          forceReindex: true,
        });
      },

      setGalleryActiveMenu: (activeMenu) => set({ activeMenu }),
      addGalleryExtractingPath: (path) =>
        set((s) => {
          const mediaPaths = s.entries.flatMap((e) =>
            e.kind === "media" ? [e.path] : e.items.map((item) => item.path),
          );
          const canonical = mediaPaths.find((p) => mediaPathsMatch(p, path)) ?? path;
          if (s.extractingByPath[canonical]) return s;
          return { extractingByPath: { ...s.extractingByPath, [canonical]: true } };
        }),
      removeGalleryExtractingPath: (path) =>
        set((s) => {
          const key =
            Object.keys(s.extractingByPath).find((p) => mediaPathsMatch(p, path)) ?? path;
          if (!s.extractingByPath[key]) return s;
          const next = { ...s.extractingByPath };
          delete next[key];
          return { extractingByPath: next };
        }),
      setGalleryExtractingPath: (path) =>
        set((s) => {
          if (!path) return { extractingByPath: {} };
          return { extractingByPath: { ...s.extractingByPath, [path]: true } };
        }),
    }),
    {
      name: "ruforge-main",
      storage: createRuforgePersistStorage(),
      partialize: (s): RuforgePersistedSubset => ({
        settings: s.settings,
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
            try {
              const cfg = await hydrateLibraryFromRust();
              useRuforgeStore.setState(libraryConfigToStoreFields(cfg));
            } catch (e) {
              console.error("Library config hydrate failed:", e);
            }
          })();
        };
      },
    },
  ),
);

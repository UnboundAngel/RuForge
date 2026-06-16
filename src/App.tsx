import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Webview } from "@tauri-apps/api/webview";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";
import { syncRuforgeAccentCss } from "./accentCss";
import { isDebugCategoryEnabled } from "./debug/debugCategories";
import { debugLog } from "./debug/debugLog";
import { useUrlDropIntake } from "./features/downloader/useUrlDropIntake";
import { getYoutubeUrlDropHandler } from "./features/downloader/youtubeUrlDropRegistry";
import { Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { runUpdateCheck } from "./updaterCheck";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  UpdaterStatusIndicator,
  UpdaterMainOverlays,
  UpdaterFullWindowUpdate,
  UpdaterPostInstallStack,
  RELEASES_PAGE,
  type UpdaterPhase,
} from "./components/UpdaterLayers";
import {
  buildPostInstallPayload,
  clearPendingPostInstall,
  consumePendingPostInstall,
  setPendingPostInstall,
  teaserNotesFromUpdaterBody,
  type PostInstallPayload,
} from "./updatePostInstall";
import { Icon } from "@iconify/react";
import MiniPlayer from "./MiniPlayer";
import MusicMiniPlayer from "./components/music-mini/MusicMiniPlayer";
import { isAudioOnlyPath } from "./mediaKind";
import { flattenGalleryScanToMediaFiles } from "./galleryScan";
import { ExplorerWatchQueueButton } from "./components/ExplorerWatchQueueButton";
import { ExplorerTitlebarNav } from "./components/ExplorerTitlebarNav";
import { TitlebarHoverButton } from "./components/TitlebarHoverButton";
import { DownloaderView } from "./components/DownloaderView";
import { PlayerView, type PlayerViewHandle } from "./components/PlayerView";
import { SettingsView } from "./components/SettingsView";
import { MediaView } from "./components/MediaView";
import { AuthorizeCleanupModal } from "./components/AuthorizeCleanupModal";
import { RecentlyDeletedModal } from "./components/RecentlyDeletedModal";
import { ExportBundleHost } from "./components/ExportBundleModal";
import { useRemovableDrivesPoll } from "./hooks/useRemovableDrivesPoll";
import { buildEntireLibraryExportPreset } from "./lib/exportSelection";
import { resolveExportDestForUsbOpen } from "./lib/exportDestResolve";
import { ConfirmDialogHost } from "./components/ConfirmDialog";
import type { SendToMainPayload, SendToMusicMainPayload } from "./playerHandoff";
import { stageHandoffListenEventId } from "./lib/musicListenSession";

function miniKindFromWindowLabel(label: string): "video" | "music" | null {
  if (label === "mini") return "video";
  if (label === "music-mini") return "music";
  return null;
}

function initialMiniKind(): "video" | "music" | null {
  try {
    return miniKindFromWindowLabel(getCurrentWindow().label);
  } catch {
    return null;
  }
}
import { PlaylistDetailView } from "./components/PlaylistDetailView";
import { MusicShell } from "./components/music/MusicShell";
import { YouTubeProfileChip } from "./components/music/YouTubeProfileChip";
import {
  applyYoutubeProfileProbe,
  type YoutubeProfileSessionState,
} from "./lib/youtubeProfileSession";
import {
  onYoutubeAuthSurfaceEnter,
  onYoutubeAuthSurfaceLeave,
} from "./lib/youtubeAuthSurface";
import {
  runBootProfileProbeIfNeeded,
  maybeScheduleIdentityFollowupProbe,
  scheduleExplorerProfileProbeAfterShow,
} from "./lib/youtubeProfileProbeRunner";
import { MediaFile } from "./types";
import {
  Settings,
  Search,
  Trash2,
  CheckCircle2,
  X,
  Loader2,
  AlertCircle,
  HardDrive,
} from "lucide-react";
import { OnboardingFlow, resolveActiveOnboardingSteps } from "./components/onboarding/OnboardingFlow";
import { ActivityIsland } from "./components/island/ActivityIsland";
import { WindowResizeEdges } from "./components/window/WindowResizeEdges";
import type { ActivityHandoffSyncPayload, ActivityMiniTeardownPayload } from "./lib/activityTypes";
import { MainPlaybackHost } from "./playback/MainPlaybackHost";
import { AppSidebarRail } from "./components/navigation/AppSidebarRail";
import { RadialNavOverlay } from "./components/navigation/RadialNavOverlay";
import { RF_TITLEBAR_H_PX } from "./lib/chromeLayout";
import { SIDEBAR_RAIL_PX } from "./lib/sidebarLayout";
import { useAltRadialNav } from "./hooks/useAltRadialNav";
import { notifyOnboardingModeSwap } from "./lib/onboardingRadialBridge";
import { writeOnboardingLastSeenVersion } from "./lib/onboardingStorage";

import { useRuforgeStore, RUFORGE_INTERNAL_DIR, type ActiveTab } from "./store/ruforgeStore";
import {
  hydratePlatformDefaultPaths,
  shouldReplaceStaleWindowsOutputDir,
} from "./platformPaths";
import type { DownloadJobFinishedPayload } from "./downloadQueue";
import { normalizeProgressPayload, type ProgressPayload } from "./types";
import { setMainWindowFocused } from "./appWindowFocus";
import {
  EMBEDDED_EXPLORER_WEBVIEW_LABEL,
  EXPLORER_PAUSE_MEDIA_SCRIPT,
  ensureEmbeddedExplorerWebview,
  explorerNavigateOrReloadScript,
  getEmbeddedExplorerWebview,
} from "./explorerWebviewLifecycle";
import {
  EXPLORER_YOUTUBE_PROFILE_EVENT,
  MUSIC_EXPLORE_WEBVIEW_LABEL,
  type ExplorerYouTubeProfilePayload,
} from "./explorerProfileScript";
import {
  createExplorerBoundsRafScheduler,
  explorerBoundsEqual,
  insetExplorerBoundsForRoundedWindow,
  readExplorerHostBounds,
  runExplorerLayoutTransitionFollowUp,
  type ExplorerBounds,
} from "./explorerBoundsSync";
import { useMainWindowMaximized } from "./hooks/useMainWindowMaximized";
import { useMainWindowTransparentFrame } from "./hooks/useMainWindowTransparentFrame";
import { setupTaskbarTransportBridge } from "./lib/taskbarTransportSync";

const WindowControls = ({
  isMaximized,
  onExportUsbClick,
  hasRemovableDrive,
  navMode,
  updaterPhase,
  updaterVersion,
  showExplorerQueueToolbar,
  storageBlocksNewDownloads,
  onUpdaterStatusClick,
}: {
  isMaximized: boolean;
  onExportUsbClick: () => void;
  hasRemovableDrive: boolean;
  navMode: string;
  updaterPhase: UpdaterPhase;
  updaterVersion: string | null;
  showExplorerQueueToolbar: boolean;
  storageBlocksNewDownloads: boolean;
  onUpdaterStatusClick?: () => void;
}) => {
  const appWindow = getCurrentWindow();

  return (
    <div className="fixed top-0 right-0 z-[100] flex h-[var(--rf-titlebar-h)] items-center pr-2 pointer-events-auto">
      <div className="mr-3">
        <UpdaterStatusIndicator 
          phase={updaterPhase} 
          version={updaterVersion} 
          onClick={onUpdaterStatusClick}
        />
      </div>

      {showExplorerQueueToolbar && (
        <ExplorerWatchQueueButton
          storageBlocksNewDownloads={storageBlocksNewDownloads}
        />
      )}

      {navMode !== "music" && (
        <TitlebarHoverButton
          tooltip={
            hasRemovableDrive
              ? "Export to removable drive"
              : "Export media bundle"
          }
          onClick={onExportUsbClick}
        >
          <Icon
            icon={
              hasRemovableDrive ? "tabler:device-usb-filled" : "tabler:device-usb"
            }
            width={18}
            height={18}
          />
        </TitlebarHoverButton>
      )}

      <YouTubeProfileChip
        size="sm"
        className="h-10 flex items-center justify-end shrink-0 self-center"
      />

      <div className="w-px h-4 bg-stone-500/20 mx-1" />

      <button
        onClick={() => appWindow.minimize()}
        className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-100 transition-colors"
      >
        <Icon icon="tabler:minus" fontSize={16} />
      </button>

      <button
        onClick={() => appWindow.toggleMaximize()}
        className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-100 transition-colors"
      >
        <Icon icon={isMaximized ? "tabler:minimize" : "tabler:maximize"} fontSize={14} />
      </button>

      <button
        onClick={() => appWindow.close()}
        className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-red-500 transition-colors"
      >
        <Icon icon="tabler:x" fontSize={16} />
      </button>
    </div>
  );
};

/** JSON string for `buildPostInstallPayload` — Settings debug updater cycle (structured What's New). */
const MOCK_POST_INSTALL_JSON = JSON.stringify({
  notes: "Structured release notes (debug). Plain `updater.json` notes still render as one block.",
  additions: ["Polished UI & transitions", "Enhanced accent color integration"],
  fixes: ["Subtitle ghosting in player", "MiniPlayer sizing on narrow layouts"],
});

function App() {
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const setActiveTab = useRuforgeStore((s) => s.setActiveTab);
  const navMode = useRuforgeStore((s) => s.navMode);
  const cycleNavMode = useRuforgeStore((s) => s.cycleNavMode);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const settings = useRuforgeStore((s) => s.settings);
  const settingsTab = useRuforgeStore((s) => s.settingsTab);
  const setSettingsTab = useRuforgeStore((s) => s.setSettingsTab);
  const galleryFilter = useRuforgeStore((s) => s.galleryFilter);
  const setGalleryFilter = useRuforgeStore((s) => s.setGalleryFilter);
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const setFolderAudioPlaylist = useRuforgeStore((s) => s.setFolderAudioPlaylist);
  const folderAudioPlaylist = useRuforgeStore((s) => s.folderAudioPlaylist);
  const selectedPlaylist = useRuforgeStore((s) => s.selectedPlaylist);
  const setSelectedPlaylist = useRuforgeStore((s) => s.setSelectedPlaylist);
  const [miniKind, setMiniKind] = useState<"video" | "music" | null>(initialMiniKind);
  const isMainMaximized = useMainWindowMaximized();
  useMainWindowTransparentFrame(isMainMaximized);
  const isSearchExpanded = useRuforgeStore((s) => s.isSearchExpanded);
  const setIsSearchExpanded = useRuforgeStore((s) => s.setIsSearchExpanded);
  const searchValue = useRuforgeStore((s) => s.searchValue);
  const setSearchValue = useRuforgeStore((s) => s.setSearchValue);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [recentlyDeletedOpen, setRecentlyDeletedOpen] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);
  /** 0 = bulge tabs flush on panel; 1 = tucked into the title band (scrollable settings only). */
  const settingsTabMorph = useMotionValue(0);
  const settingsTabMorphY = useTransform(
    settingsTabMorph,
    [0, 1],
    [0, -RF_TITLEBAR_H_PX],
  );
  const [settingsMorphAmount, setSettingsMorphAmount] = useState(0);
  const [settingsScrollable, setSettingsScrollable] = useState(false);
  const settingsTabsDocked = settingsMorphAmount > 0.55;
  const settingsTabShapeLayout = !settingsTabsDocked;
  /** Bulge + corner fillets only at scroll rest; hide during morph/dock so curves don't bleed over content. */
  const showSettingsTabBulge =
    !settingsTabsDocked && settingsMorphAmount < 0.02;
  useMotionValueEvent(settingsTabMorph, "change", setSettingsMorphAmount);
  const settingsTabDockLeft = SIDEBAR_RAIL_PX + 48;
  const sidebarChromeLeft = SIDEBAR_RAIL_PX;
  const backgroundVideoFile =
    playingFile && !isAudioOnlyPath(playingFile.path) ? playingFile : null;
  const videoPlayerShellVisible =
    Boolean(backgroundVideoFile) && navMode !== "music" && activeTab === "player";
  const notifications = useRuforgeStore((s) => s.notifications);
  const dismissNotification = useRuforgeStore((s) => s.dismissNotification);
  const notify = useRuforgeStore((s) => s.notify);
  const openExportPanel = useRuforgeStore((s) => s.openExportPanel);
  const { removableDrives, defaultRemovableDest } = useRemovableDrivesPoll();
  const hasRemovableDrive = removableDrives.length > 0;

  const handleExportUsbTitlebar = useCallback(async () => {
    const { fetchEntries } = useRuforgeStore.getState();
    let galleryEntries = useRuforgeStore.getState().entries;
    if (galleryEntries.length === 0) {
      await fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true });
      galleryEntries = useRuforgeStore.getState().entries;
    }
    const preset = buildEntireLibraryExportPreset(galleryEntries);
    const initialDestDir = await resolveExportDestForUsbOpen(defaultRemovableDest);
    if (!preset) {
      openExportPanel({
        paths: [],
        label: "Export",
        initialDestDir,
      });
      notify("Library is empty. Scan or download first.", "warning");
      return;
    }
    openExportPanel({
      ...preset,
      initialDestDir,
    });
  }, [defaultRemovableDest, openExportPanel, notify]);
  const downloaderDuplicateDialogOpen = useRuforgeStore((s) => s.downloaderDuplicateDialogOpen);

  const { bindRef: bindMainWindowUrlDrop, isDragOver: isMainUrlDropHover } = useUrlDropIntake({
    duplicateModalOpen: downloaderDuplicateDialogOpen,
    onDroppedYoutubeUrls: async (urls) => {
      flushSync(() => {
        setActiveTab("downloader");
      });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const h = getYoutubeUrlDropHandler();
      if (!h) {
        notify("Drop could not be handled. Open the Download tab and try again.");
        return;
      }
      await h(urls);
    },
    toastNoSupportedUrl: () => notify("No supported URL in drop."),
    toastModalBlocked: () => notify("Finish current dialog first."),
  });

  const assignMainScrollAndUrlDropRef = useCallback(
    (node: HTMLElement | null) => {
      mainContentRef.current = node;
      bindMainWindowUrlDrop(node);
    },
    [bindMainWindowUrlDrop],
  );

  /** Fixed cutout to the right of the sidebar; webview bounds sync to this node. */
  const explorerWebviewHostRef = useRef<HTMLDivElement>(null);
  /** Windows: JS child webview handle. Linux: embedded via Rust + GTK overlay. */
  const explorerWebviewRef = useRef<Webview | null>(null);
  /** True while the Webview constructor IPC is in flight (tauri://created not yet received). */
  const explorerWebviewCreatingRef = useRef(false);
  const explorerLinuxEmbedRef = useRef(false);
  const explorerWebviewLabelRef = useRef(EMBEDDED_EXPLORER_WEBVIEW_LABEL);
  const prevActiveTabRef = useRef<ActiveTab>(activeTab);
  /** One reload when entering Explorer; layout sync must not re-arm this. */
  const explorerReloadPendingRef = useRef(false);
  const explorerLastSyncedBoundsRef = useRef<ExplorerBounds | null>(null);
  const explorerScheduleSyncRef = useRef<(() => void) | null>(null);
  const applyDownloadProgress = useRuforgeStore((s) => s.applyDownloadProgress);
  const onDownloadJobFinished = useRuforgeStore((s) => s.onDownloadJobFinished);
  const onDownloadJobPaused = useRuforgeStore((s) => s.onDownloadJobPaused);
  const playerViewRef = useRef<PlayerViewHandle>(null);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const setOutputDir = useRuforgeStore((s) => s.setOutputDir);
  const storageStats = useRuforgeStore((s) => s.storageStats);

  useEffect(() => {
    void (async () => {
      try {
        const { outputDir: resolved } = await hydratePlatformDefaultPaths();
        const saved = localStorage.getItem("ruforge-output-dir");
        if (shouldReplaceStaleWindowsOutputDir(saved)) {
          setOutputDir(resolved);
        }
      } catch (e) {
        debugLog("app.platform", "warn", "platform path hydrate failed", e);
      }
    })();
  }, [setOutputDir]);

  useEffect(() => {
    const enabled = useRuforgeStore.getState().settings.debugLogEnabledCategories;
    void invoke("sync_debug_log_categories", { enabled }).catch(() => {});
  }, []);
  const lastExplorerUrl = useRuforgeStore((s) => s.lastExplorerUrl);
  const setLastExplorerUrl = useRuforgeStore((s) => s.setLastExplorerUrl);
  const setYoutubeProfileSession = useRuforgeStore((s) => s.setYoutubeProfileSession);
  const lastExplorerUrlRef = useRef(lastExplorerUrl);
  lastExplorerUrlRef.current = lastExplorerUrl;
  const storageBlocksNewDownloads =
    saveToInternal &&
    (storageStats
      ? storageStats.total_bytes / (1024 * 1024 * 1024) >= settings.storageLimitGB
      : false);

  const updateRef = useRef<Update | null>(null);
  const handleInstallRestartRef = useRef<() => Promise<void>>(async () => {});
  const [updaterPhase, setUpdaterPhase] = useState<UpdaterPhase>("idle");
  const [updaterVersion, setUpdaterVersion] = useState<string | null>(null);
  const [, setUpdaterNotes] = useState("");
  const [updaterDownloaded, setUpdaterDownloaded] = useState(0);
  const [updaterContentLength, setUpdaterContentLength] = useState<number | undefined>(undefined);
  const [updaterTeaserDismissed, setUpdaterTeaserDismissed] = useState(false);
  const [postInstall, setPostInstall] = useState<PostInstallPayload | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const shellBlocked = Boolean(postInstall);

  const applyAvailableUpdate = useCallback((next: Update) => {
    if (updateRef.current) {
      void updateRef.current.close().catch(() => {});
    }
    updateRef.current = next;
    setUpdaterVersion(next.version);
    setUpdaterNotes(teaserNotesFromUpdaterBody(next.body ?? ""));
    setUpdaterTeaserDismissed(false);
    setUpdaterPhase("available");
  }, []);

  const performUpdateCheck = useCallback(
    async (userInitiated: boolean) => {
      if (userInitiated) {
        await emit("ruforge-updater-check-status", { busy: true });
      }
      const result = await runUpdateCheck();
      if (userInitiated) {
        await emit("ruforge-updater-check-status", { busy: false });
      }
      if (result.kind === "available") {
        applyAvailableUpdate(result.update);
        if (userInitiated) {
          notify(`Update v${result.version} found. Downloading…`);
          await handleInstallRestartRef.current();
        }
        return;
      }
      if (result.kind === "up-to-date") {
        if (userInitiated) {
          notify(`You're up to date (v${result.currentVersion}).`);
        }
        return;
      }
      if (userInitiated) {
        notify(
          `Couldn't check for updates: ${result.message}. Try again later or install from GitHub Releases.`,
          "error",
        );
      } else {
        console.error("Update check failed", result.message);
      }
    },
    [applyAvailableUpdate, notify],
  );

  const handleInstallRestart = useCallback(async () => {
    const u = updateRef.current;
    if (!u) return;
    setUpdaterDownloaded(0);
    setUpdaterContentLength(undefined);
    setUpdaterPhase("downloading");
    setPendingPostInstall(buildPostInstallPayload(u.version, u.body ?? ""));
    let installFinished = false;
    try {
      await u.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setUpdaterContentLength(event.data.contentLength);
        } else if (event.event === "Progress") {
          setUpdaterDownloaded((d) => d + event.data.chunkLength);
        } else if (event.event === "Finished") {
          installFinished = true;
          setUpdaterPhase("installing");
        }
      });
    } catch (e) {
      // Installer often succeeds then kills the app; the promise rejects on shutdown.
      if (installFinished) return;
      console.error(e);
      clearPendingPostInstall();
      setUpdaterPhase("available");
      notify(
        "Update failed. Check your connection, or install the latest build from GitHub Releases.",
        "error",
      );
    }
  }, [notify]);
  handleInstallRestartRef.current = handleInstallRestart;

  const availableUpdatePayload = useMemo(() => {
    if (!updateRef.current) return null;
    return buildPostInstallPayload(updateRef.current.version, updateRef.current.body ?? "");
  }, [updaterVersion]); // updaterVersion changes when updateRef is set

  useEffect(() => {
    invoke<boolean>("get_hardware_acceleration_pref")
      .then((hw) => {        useRuforgeStore.getState().mergeHardwareAccelerationFromBackend(hw);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    syncRuforgeAccentCss(typeof settings.accentColor === "string" ? settings.accentColor : "#EDCF9B");
  }, [settings.accentColor]);

  useEffect(() => {
    if (!saveToInternal) return;
    void refreshStorageStats();
  }, [refreshStorageStats, outputDir, saveToInternal]);

  const downloadIpcHandlersRef = useRef({
    applyDownloadProgress,
    onDownloadJobFinished,
    onDownloadJobPaused,
  });
  downloadIpcHandlersRef.current = {
    applyDownloadProgress,
    onDownloadJobFinished,
    onDownloadJobPaused,
  };

  // Register once for the app lifetime (stable refs — avoids duplicate listeners on dep churn).
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let disposed = false;

    const register = async () => {
      const uProgress = await listen<ProgressPayload & { job_id?: string }>(
        "download-progress",
        (event) => {
          const normalized = normalizeProgressPayload(event.payload);
          if (!normalized) return;
          downloadIpcHandlersRef.current.applyDownloadProgress(normalized);
        },
      );
      if (disposed) {
        uProgress();
        return;
      }
      unsubs.push(uProgress);

      const uFinished = await listen<
        DownloadJobFinishedPayload & { job_id?: string }
      >("download-job-finished", (event) => {
        const raw = event.payload;
        const jobId = raw.jobId ?? raw.job_id;
        if (!jobId) return;
        downloadIpcHandlersRef.current.onDownloadJobFinished({
          jobId,
          url: raw.url,
          success: raw.success,
          error: raw.error,
        });
      });
      if (disposed) {
        uFinished();
        return;
      }
      unsubs.push(uFinished);

      const uPaused = await listen<string>("download-job-paused", (event) => {
        downloadIpcHandlersRef.current.onDownloadJobPaused(event.payload);
      });
      if (disposed) {
        uPaused();
        return;
      }
      unsubs.push(uPaused);
    };

    void (async () => {
      await register();
      if (disposed) return;
      try {
        await invoke<number>("stop_all_active_download_jobs");
      } catch (e) {
        console.error("[RuForge] stop_all_active_download_jobs failed", e);
      }
    })();
    return () => {
      disposed = true;
      for (const u of unsubs) u();
    };
  }, []);

  // Manage Embedded Explorer Webview.
  // Deps: `activeTab` only. Sidebar toggles schedule via explorerScheduleSyncRef
  // so listeners are not torn down during the 500ms width transition.
  useEffect(() => {
    let active = true;
    const wasOnExplorer = prevActiveTabRef.current === "explorer";
    const onExplorer = activeTab === "explorer";
    const enteringExplorer = !wasOnExplorer && onExplorer;
    prevActiveTabRef.current = activeTab;
    if (enteringExplorer) {
      explorerReloadPendingRef.current = true;
      explorerLastSyncedBoundsRef.current = null;
      if (mainContentRef.current) {
        mainContentRef.current.scrollTop = 0;
      }
      onYoutubeAuthSurfaceEnter();
    }
    if (wasOnExplorer && !onExplorer) {
      onYoutubeAuthSurfaceLeave();
    }
    if (!onExplorer) {
      explorerReloadPendingRef.current = false;
      explorerLastSyncedBoundsRef.current = null;
    }

    const pauseExplorerMedia = async () => {
      try {
        await invoke("eval_in_webview", {
          label: explorerWebviewLabelRef.current,
          script: EXPLORER_PAUSE_MEDIA_SCRIPT,
        });
      } catch {
        /* webview not mounted */
      }
    };

    const reloadExplorerPage = async () => {
      const url = lastExplorerUrlRef.current.trim();
      const target = url.startsWith("http") ? url : "https://www.youtube.com";
      try {
        await invoke("eval_in_webview", {
          label: explorerWebviewLabelRef.current,
          script: explorerNavigateOrReloadScript(target),
        });
      } catch {
        /* webview still creating */
      }
    };

    const maybeReloadExplorerOnEnter = async () => {
      if (!explorerReloadPendingRef.current) return;
      explorerReloadPendingRef.current = false;
      await reloadExplorerPage();
    };

    const applyExplorerBounds = async (bounds: ExplorerBounds) => {
      const { x: finalX, y: finalY, width: finalW, height: finalH } = bounds;

      if (explorerLinuxEmbedRef.current) {
        await invoke("ensure_embedded_explorer_bounds", {
          x: finalX,
          y: finalY,
          width: finalW,
          height: finalH,
        });
        return;
      }

      const appWindow = getCurrentWindow();
      if (!explorerWebviewRef.current) {
        if (explorerWebviewCreatingRef.current) return;
        explorerWebviewCreatingRef.current = true;

        try {
          const dataDir = await appDataDir();
          const explorerDataPath = await join(dataDir, "explorer-data");
          const extraBrowserArgs = await invoke<string | null>(
            "get_hardware_acceleration_browser_args",
          );

          const webview = await ensureEmbeddedExplorerWebview({
            window: appWindow,
            label: explorerWebviewLabelRef.current,
            url: "https://www.youtube.com",
            x: finalX,
            y: finalY,
            width: finalW,
            height: finalH,
            dataDirectory: explorerDataPath,
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            additionalBrowserArgs: extraBrowserArgs,
          });

          explorerWebviewCreatingRef.current = false;
          if (!active) return;
          explorerWebviewRef.current = webview;
          if (activeTab === "explorer") {
            void maybeReloadExplorerOnEnter();
            scheduleExplorerProfileProbeAfterShow("explorer-open");
          }
        } catch (e) {
          explorerWebviewCreatingRef.current = false;
          console.error("[RuForge] Explorer webview error", e);
          explorerScheduleSyncRef.current?.();
        }

        return;
      }

      const webview = explorerWebviewRef.current;
      await webview.show();
      await Promise.all([
        webview.setPosition(new LogicalPosition(finalX, finalY)),
        webview.setSize(new LogicalSize(finalW, finalH)),
      ]);
      if (activeTab === "explorer") {
        scheduleExplorerProfileProbeAfterShow("explorer-open");
      }
    };

    const syncWebview = async () => {
      if (!active) return;

      if (onExplorer) {
        const host = explorerWebviewHostRef.current;
        if (!host) return;

        const raw = readExplorerHostBounds(host);
        if (!raw) return;
        const bounds = insetExplorerBoundsForRoundedWindow(
          raw,
          host,
          !isMainMaximized,
        );

        if (
          explorerBoundsEqual(bounds, explorerLastSyncedBoundsRef.current)
        ) {
          return;
        }
        explorerLastSyncedBoundsRef.current = bounds;

        try {
          await applyExplorerBounds(bounds);
          await maybeReloadExplorerOnEnter();
        } catch (e: unknown) {
          explorerLastSyncedBoundsRef.current = null;
          console.error("[RuForge] Explorer bounds sync failed", e);
        }
        return;
      }

      if (wasOnExplorer) {
        await pauseExplorerMedia();
      }
      if (explorerLinuxEmbedRef.current) {
        try {
          await invoke("set_embedded_explorer_visible", { visible: false });
        } catch (e: unknown) {
          console.error("Explorer hide (linux) failed", e);
        }
      } else if (explorerWebviewRef.current) {
        try {
          await explorerWebviewRef.current.hide();
        } catch (e: unknown) {
          console.error("Webview hide failed", e);
        }
      }
    };

    const { schedule: scheduleSync, cancel: cancelScheduledSync } =
      createExplorerBoundsRafScheduler(() => {
        void syncWebview();
      });
    explorerScheduleSyncRef.current = scheduleSync;

    scheduleSync();

    window.addEventListener("resize", scheduleSync);

    let resizeObserver: ResizeObserver | undefined;
    const attachResizeObserver = () => {
      const el = explorerWebviewHostRef.current;
      if (!el || !onExplorer) return;
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleSync);
      resizeObserver.observe(el);
    };
    attachResizeObserver();
    const resizeObserverRaf = requestAnimationFrame(attachResizeObserver);

    let unlistenWindowResize: (() => void) | undefined;
    void getCurrentWindow()
      .onResized(scheduleSync)
      .then((unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        unlistenWindowResize = unlisten;
      });

    return () => {
      active = false;
      explorerWebviewCreatingRef.current = false;
      explorerScheduleSyncRef.current = null;
      cancelScheduledSync();
      window.removeEventListener("resize", scheduleSync);
      cancelAnimationFrame(resizeObserverRaf);
      resizeObserver?.disconnect();
      unlistenWindowResize?.();
    };
  }, [activeTab, isMainMaximized]);

  useEffect(() => {
    if (activeTab !== "explorer") return;
    explorerLastSyncedBoundsRef.current = null;
    const schedule = explorerScheduleSyncRef.current;
    if (!schedule) return;
    schedule();
    runExplorerLayoutTransitionFollowUp(schedule);
  }, [activeTab]);

  // Explorer host lives outside AnimatePresence; re-sync once the cutout node commits.
  useEffect(() => {
    if (activeTab !== "explorer" || shellBlocked) return;
    let cancelled = false;
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      frames += 1;
      if (explorerWebviewHostRef.current) {
        explorerLastSyncedBoundsRef.current = null;
        explorerScheduleSyncRef.current?.();
        return;
      }
      if (frames < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [activeTab, shellBlocked]);

  const performUpdateCheckRef = useRef(performUpdateCheck);
  performUpdateCheckRef.current = performUpdateCheck;

  useEffect(() => {
    void performUpdateCheckRef.current(false);
  }, []);

  useEffect(() => {
    void invoke<string>("embedded_explorer_webview_label").then((label) => {
      explorerWebviewLabelRef.current = label;
      explorerLinuxEmbedRef.current = label !== EMBEDDED_EXPLORER_WEBVIEW_LABEL;
      if (explorerLinuxEmbedRef.current) return;
      void getEmbeddedExplorerWebview(label).then((webview) => {
        if (webview) explorerWebviewRef.current = webview;
      });
    });
  }, []);

  useEffect(() => {
    const pending = consumePendingPostInstall();
    if (pending) setPostInstall(pending);
  }, []);

  useEffect(() => {
    if (postInstall) return;
    const steps = resolveActiveOnboardingSteps();
    if (steps.length > 0) setOnboardingOpen(true);
  }, [postInstall]);

  useEffect(() => {
    try {
      const kind = miniKindFromWindowLabel(getCurrentWindow().label);
      if (kind) setMiniKind(kind);
    } catch (e) {
      console.error("Window detection failed", e);
    }
  }, []);

  // Foreground state for in-app vs overlay notifications (main window only).
  useEffect(() => {
    const win = getCurrentWindow();
    if (win.label !== "main") return;

    let disposed = false;
    const sync = (focused: boolean) => {
      if (!disposed) setMainWindowFocused(focused);
    };

    void win.isFocused().then((f) => sync(f));

    const onVis = () => {
      if (document.visibilityState === "hidden") sync(false);
      else void win.isFocused().then(sync);
    };
    document.addEventListener("visibilitychange", onVis);

    let unlistenFocus: (() => void) | undefined;
    void win.onFocusChanged(({ payload: focused }) => sync(focused)).then((u) => {
      if (disposed) u();
      else unlistenFocus = u;
    });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVis);
      unlistenFocus?.();
    };
  }, []);

  // Focus search on expand
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

  useEffect(() => setupTaskbarTransportBridge(), []);

  // Tauri event listeners
  useEffect(() => {
    const unlisten = listen<MediaFile>("play-media", (event) => {
      const file = event.payload;
      const st = useRuforgeStore.getState();
      st.setPlayingFile(file);
      void emit("stop-playback", "main-app");
      st.notify(`Now playing: ${file.name}`);
      st.setActiveTab("player");
    });

    const unlistenStop = listen<string>("stop-playback", (event) => {
      if (event.payload === "main-app") return;
      const st = useRuforgeStore.getState();
      if (st.activityOwner === "music-mini") return;
      if (event.payload === "mini-player") {
        useRuforgeStore.setState((s) => ({
          playingFile: null,
          activeTab: s.activeTab === "player" ? "media" : s.activeTab,
        }));
        return;
      }
      useRuforgeStore.getState().stopPlayback();
    });

    const unlistenMiniTeardown = listen<ActivityMiniTeardownPayload>(
      "activity-mini-teardown",
      (event) => {
        const st = useRuforgeStore.getState();
        if (st.activityOwner === event.payload.surface) {
          st.clearActivityHandoff();
        }
      },
    );

    const unlistenHandoffSync = listen<ActivityHandoffSyncPayload>(
      "activity-handoff-sync",
      (event) => {
        const { surface, file, startTime, paused } = event.payload;
        useRuforgeStore.getState().syncActivityHandoff(surface, {
          file,
          startTime,
          paused,
        });
      },
    );

    const unlistenManualUpdaterCheck = listen("ruforge-check-updater", () => {
      void performUpdateCheckRef.current(true);
    });

    const unlistenDebugOnboarding = listen("debug-replay-onboarding", () => {
      if (useRuforgeStore.getState().settings.showDebuggingSettings !== true) return;
      writeOnboardingLastSeenVersion("0.0.0");
      setOnboardingOpen(true);
    });

    const unlistenDebugBootSplash = listen("debug-preview-boot-splash", () => {
      if (useRuforgeStore.getState().settings.showDebuggingSettings !== true) return;
      void import("./lib/bootSplash").then(({ showBootSplashPreview }) => {
        showBootSplashPreview();
      });
    });

    const unlistenDebugUpdater = listen("debug-cycle-updater", () => {
      setUpdaterTeaserDismissed(false); // Reset dismissal on debug cycle
      setUpdaterPhase((current) => {
        if (current === "idle") {
          setUpdaterVersion("9.9.9-mock");
          setUpdaterNotes("### Mock Release Notes\n- Polished UI & Transitions\n- Enhanced accent color integration\n- Fixed subtitle ghosting bug\n- Improved MiniPlayer sizing logic");
          return "available";
        }
        if (current === "available") {
          setUpdaterContentLength(1000);
          setUpdaterDownloaded(450);
          return "downloading";
        }
        if (current === "downloading") {
          return "installing";
        }
        if (current === "installing") {
          setPostInstall(
            buildPostInstallPayload("9.9.9-mock", MOCK_POST_INSTALL_JSON),
          );
          return "idle";
        }
        return "idle";
      });
    });

    return () => {
      unlisten.then((f) => f());
      unlistenStop.then((f) => f());
      unlistenMiniTeardown.then((f) => f());
      unlistenHandoffSync.then((f) => f());
      unlistenManualUpdaterCheck.then((f) => f());
      unlistenDebugOnboarding.then((f) => f());
      unlistenDebugBootSplash.then((f) => f());
      unlistenDebugUpdater.then((f) => f());
    };
  }, []);

  // Send-to-main handoff from video miniplayer
  useEffect(() => {
    const unlistenHandoff = listen<SendToMainPayload | MediaFile>("send-to-main", async (event) => {
      const raw = event.payload;
      const payload: SendToMainPayload =
        raw && typeof raw === "object" && "currentTime" in raw
          ? (raw as SendToMainPayload)
          : {
              file: raw as MediaFile,
              currentTime: 0,
              paused: false,
            };
      const st = useRuforgeStore.getState();
      if (typeof payload.volume === "number") st.setVolume(payload.volume);
      if (typeof payload.muted === "boolean") st.setMuted(payload.muted);
      st.setPlayingFile(payload.file);
      st.setActiveTab("player");
      useRuforgeStore.setState({ playerResumeAt: Math.max(0, payload.currentTime) });
      st.notify(`Now playing: ${payload.file.name}`);
      const focusMain = async () => {
        const main = await WebviewWindow.getByLabel("main");
        await main?.setFocus().catch(() => {});
      };
      await focusMain();
      window.setTimeout(() => void focusMain(), 120);
    });
    return () => {
      unlistenHandoff.then((f) => f());
    };
  }, []);

  // Send-to-music-main handoff from music miniplayer
  useEffect(() => {
    const unlisten = listen<SendToMusicMainPayload>("send-to-music-main", async (event) => {
      const payload = event.payload;
      if (payload.listenEventId) {
        stageHandoffListenEventId(payload.listenEventId);
      }
      const st = useRuforgeStore.getState();
      if (typeof payload.volume === "number") st.setVolume(payload.volume);
      if (typeof payload.muted === "boolean") st.setMuted(payload.muted);
      useRuforgeStore.setState({
        musicPlayerResume: {
          currentTime: Math.max(0, payload.currentTime),
          paused: payload.paused,
          playbackSpeed: payload.playbackSpeed ?? 1,
        },
        ...(payload.manualQueue !== undefined ? { manualQueue: payload.manualQueue } : {}),
        ...(payload.playingFromManualQueue !== undefined
          ? { playingFromManualQueue: payload.playingFromManualQueue }
          : {}),
        ...(payload.manualQueueContextIndex !== undefined
          ? { manualQueueContextIndex: payload.manualQueueContextIndex }
          : {}),
        ...(typeof payload.isLooping === "boolean" ? { isLooping: payload.isLooping } : {}),
      });
      st.setPlayingFile(payload.file);
      const main = await WebviewWindow.getByLabel("main");
      await main?.setFocus().catch(() => {});
      window.setTimeout(() => void main?.setFocus().catch(() => {}), 120);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // System tray "Show" — event name must match `TRAY_SHOW_MAIN_EVENT` in `src-tauri/src/tray.rs`.
  // Uses the official JS `WebviewWindow` APIs (`unminimize` / `show` / `setFocus`), same layer as
  // https://v2.tauri.app/learn/system-tray/ (JS menu `action` / window helpers).
  // Tray debug lines go to the terminal via `tray_front_debug` when app.tray-debug is enabled.
  useEffect(() => {
    const trayDbg = (line: string) => {
      const enabled = new Set(useRuforgeStore.getState().settings.debugLogEnabledCategories);
      if (!isDebugCategoryEnabled(enabled, "app.tray-debug")) return;
      void invoke("tray_front_debug", { line }).catch(() => {});
    };
    const unlistenTrayShow = listen("ruforge:tray-show-main", async () => {
      await trayDbg("App(main): listen fired for ruforge:tray-show-main");
      const main = await WebviewWindow.getByLabel("main");
      if (!main) {
        await trayDbg("App(main): WebviewWindow.getByLabel('main') returned null");
        return;
      }
      await trayDbg("App(main): got WebviewWindow label=main");
      const raise = async (pass: string) => {
        try {
          await main.unminimize();
          await trayDbg(`App(main): ${pass} unminimize ok`);
        } catch (e) {
          await trayDbg(`App(main): ${pass} unminimize err: ${String(e)}`);
        }
        try {
          await main.show();
          await trayDbg(`App(main): ${pass} show ok`);
        } catch (e) {
          await trayDbg(`App(main): ${pass} show err: ${String(e)}`);
        }
        try {
          await main.setFocus();
          await trayDbg(`App(main): ${pass} setFocus ok`);
        } catch (e) {
          await trayDbg(`App(main): ${pass} setFocus err: ${String(e)}`);
        }
      };
      await raise("pass1");
      window.setTimeout(() => void raise("pass2"), 120);
    });
    return () => {
      unlistenTrayShow.then((f) => f());
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!playingFile?.path) {
        setFolderAudioPlaylist([]);
        return;
      }

      // If the current file is already part of the existing playlist,
      // don't overwrite it (this preserves manually queued playlists/shuffles)
      const isAlreadyQueued = folderAudioPlaylist.some(f => f.path === playingFile.path);
      if (isAlreadyQueued) return;

      try {
        const itemDir = await dirname(playingFile.path);
        const bucketDir = await dirname(itemDir);
        const bucketName = bucketDir.split(/[\\/]/).pop()?.toLowerCase() ?? "";
        const BUCKET_NAMES = ["videos", "music", "movies", "shows", "playlists"];
        // Under the bucketed layout, scan the bucket dir so siblings from other item folders are found.
        // Under the legacy flat layout, scan the immediate parent.
        const scanDir = BUCKET_NAMES.includes(bucketName) ? bucketDir : itemDir;
        const scannedRaw = await invoke("scan_gallery", { dir: scanDir });
        if (cancel) return;
        const scanned = flattenGalleryScanToMediaFiles(scannedRaw);
        
        const isAudio = isAudioOnlyPath(playingFile.path);
        const neighbors = scanned
          .filter((f) => isAudioOnlyPath(f.path) === isAudio)
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
        
        setFolderAudioPlaylist(neighbors);
      } catch (e) {
        console.error(e);
        if (!cancel) setFolderAudioPlaylist([]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [playingFile?.path]); // Depend on path to trigger on song change, but we check isAlreadyQueued inside

  useEffect(() => {
    const unlisten = listen<string>("explorer-url", (event) => {
      setLastExplorerUrl(event.payload);
    });
    return () => { unlisten.then(f => f()); };
  }, [setLastExplorerUrl]);

  useEffect(() => {
    const unlisten = listen<ExplorerYouTubeProfilePayload>(
      EXPLORER_YOUTUBE_PROFILE_EVENT,
      (event) => {
        const payload = event.payload;
        const prev: YoutubeProfileSessionState = {
          status: useRuforgeStore.getState().youtubeSessionStatus,
          profile: useRuforgeStore.getState().youtubeExplorerProfile,
        };
        const next = applyYoutubeProfileProbe(payload, prev);
        const changed =
          next.status !== prev.status
          || next.profile?.displayName !== prev.profile?.displayName
          || next.profile?.avatarUrl !== prev.profile?.avatarUrl
          || next.profile?.channelHandle !== prev.profile?.channelHandle;
        if (changed) {
          setYoutubeProfileSession(next);
        }
        if (
          next.status === "signed-in"
          && next.profile?.avatarUrl
          && !next.profile?.channelHandle
          && !payload?.channelHandle
        ) {
          maybeScheduleIdentityFollowupProbe();
        }
      },
    );
    return () => { unlisten.then((f) => f()); };
  }, [setYoutubeProfileSession]);

  useEffect(() => {
    if (shellBlocked) return;
    const status = useRuforgeStore.getState().youtubeSessionStatus;
    void runBootProfileProbeIfNeeded(status);
  }, [shellBlocked]);

  useEffect(() => {
    if (navMode === "music" || shellBlocked) return;
    void (async () => {
      try {
        await invoke("eval_in_webview", {
          label: MUSIC_EXPLORE_WEBVIEW_LABEL,
          script: EXPLORER_PAUSE_MEDIA_SCRIPT,
        });
      } catch {
        /* not mounted */
      }
      const wv = await getEmbeddedExplorerWebview(MUSIC_EXPLORE_WEBVIEW_LABEL);
      if (wv) {
        try {
          await wv.hide();
        } catch {
          /* ok */
        }
      }
    })();
  }, [navMode, shellBlocked]);

  useEffect(() => {
    if (activeTab !== "explorer" || shellBlocked) return;
    let alive = true;
    const tick = async () => {
      try {
        const u = await invoke<string>("get_embedded_explorer_webview_url");
        if (alive) setLastExplorerUrl(u);
      } catch {
        /* Embedded explorer webview not mounted yet */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [activeTab, shellBlocked, setLastExplorerUrl]);

  useEffect(() => {
    if (activeTab !== "settings" || shellBlocked) {
      settingsTabMorph.set(0);
      setSettingsMorphAmount(0);
      setSettingsScrollable(false);
      return;
    }

    const morphPx = 72;
    let el = mainContentRef.current;
    let detach: (() => void) | undefined;
    let resizeEndId: ReturnType<typeof setTimeout> | undefined;
    let windowResizing = false;

    const bind = () => {
      detach?.();
      el = mainContentRef.current;
      if (!el) return;

      const applyScrollable = () => {
        const scrollable = el!.scrollHeight > el!.clientHeight + 2;
        setSettingsScrollable(scrollable);
        if (!scrollable) {
          settingsTabMorph.set(0);
          return false;
        }
        return true;
      };

      const applyMorph = () => {
        if (!applyScrollable()) return;
        if (windowResizing) return;
        settingsTabMorph.set(Math.min(1, el!.scrollTop / morphPx));
      };

      const onWindowResize = () => {
        windowResizing = true;
        if (resizeEndId !== undefined) clearTimeout(resizeEndId);
        resizeEndId = setTimeout(() => {
          windowResizing = false;
          resizeEndId = undefined;
          applyMorph();
        }, 120);
        applyScrollable();
      };

      applyMorph();
      el.addEventListener("scroll", applyMorph, { passive: true });
      const ro = new ResizeObserver(applyScrollable);
      ro.observe(el);
      window.addEventListener("resize", onWindowResize);
      detach = () => {
        el!.removeEventListener("scroll", applyMorph);
        ro.disconnect();
        window.removeEventListener("resize", onWindowResize);
        if (resizeEndId !== undefined) clearTimeout(resizeEndId);
      };
    };

    bind();
    const raf = requestAnimationFrame(bind);

    return () => {
      cancelAnimationFrame(raf);
      detach?.();
      settingsTabMorph.set(0);
      setSettingsMorphAmount(0);
      setSettingsScrollable(false);
    };
  }, [activeTab, shellBlocked, settingsTab, settingsTabMorph]);

  const showExplorerToolbar = activeTab === "explorer" && !shellBlocked;

  const onExplorerBack = useCallback(async () => {
    try {
      await invoke("eval_in_webview", {
        label: explorerWebviewLabelRef.current,
        script: "window.history.back()",
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const onExplorerForward = useCallback(async () => {
    try {
      await invoke("eval_in_webview", {
        label: explorerWebviewLabelRef.current,
        script: "window.history.forward()",
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const onExplorerReload = useCallback(async () => {
    try {
      const url = lastExplorerUrlRef.current.trim();
      await invoke("eval_in_webview", {
        label: explorerWebviewLabelRef.current,
        script: explorerNavigateOrReloadScript(url),
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const { open: radialNavOpen, anchor: radialNavAnchor } =
    useAltRadialNav(shellBlocked);

  const handleRadialCenterClick = useCallback(() => {
    cycleNavMode();
    if (onboardingOpen) notifyOnboardingModeSwap();
  }, [cycleNavMode, onboardingOpen]);

  if (miniKind === "video") return <MiniPlayer />;
  if (miniKind === "music") return <MusicMiniPlayer />;

  try {
    const label = getCurrentWindow().label;
    if (label === "mini" || label === "music-mini") {
      return null;
    }
  } catch {
    /* web bundle / tests */
  }

  return (
    <MainPlaybackHost>
    <div
      className={`h-screen w-screen text-stone-50 font-sans flex overflow-hidden select-none relative ${
        isMainMaximized
          ? "rf-main-window-shell--maximized"
          : "rf-main-window-shell--rounded"
      }`}
      style={{ background: navMode === "music" ? "var(--music-bg, #0f0f0f)" : "#271C18" }}
      data-music-mode={navMode === "music" ? "true" : undefined}
    >

      <RadialNavOverlay
        open={radialNavOpen}
        anchor={radialNavAnchor}
        onNavigate={(tab) => setActiveTab(tab)}
        onCenterClick={handleRadialCenterClick}
      />

      {showExplorerToolbar && (
        <ExplorerTitlebarNav
          left={sidebarChromeLeft}
          onBack={() => void onExplorerBack()}
          onForward={() => void onExplorerForward()}
          onReload={() => void onExplorerReload()}
        />
      )}

      {/* Window Controls */}
      <WindowControls
        isMaximized={isMainMaximized}
        onExportUsbClick={() => void handleExportUsbTitlebar()}
        hasRemovableDrive={hasRemovableDrive}
        navMode={navMode}
        updaterPhase={updaterPhase}
        updaterVersion={updaterVersion}
        showExplorerQueueToolbar={showExplorerToolbar}
        storageBlocksNewDownloads={storageBlocksNewDownloads}
        onUpdaterStatusClick={() => setUpdaterTeaserDismissed(false)}
      />

      {!shellBlocked && <ActivityIsland />}

      {/* Global Drag Region - Top strip except controls area */}
      <div
        className={`fixed top-0 left-0 z-[50] h-[var(--rf-titlebar-h)] ${showExplorerToolbar ? "right-[320px]" : "right-[240px]"}`}
        data-tauri-drag-region
      />

      <WindowResizeEdges active={!isMainMaximized} />

      {navMode === "music" ? (
        <MusicShell />
      ) : (
      <>
      <AppSidebarRail
        activeTab={activeTab}
        navMode={navMode}
        disabled={shellBlocked}
        onSelectTab={setActiveTab}
      />

      {/* ── Right Column (tab chrome above recessed content field) ─ */}
      <div className="rf-chrome-column flex-1 flex flex-col min-w-0 min-h-0 pt-[var(--rf-titlebar-h)] relative bg-[#271C18]">
        
        {/* Settings / Gallery tab strip */}
        <AnimatePresence mode="wait">
          {(activeTab === "settings" && !shellBlocked) ? (
            <motion.div
              key="settings-tabs"
              initial={false}
              className="contents"
            >
            {settingsMorphAmount > 0 && !settingsTabsDocked ? (
              <div
                className="pointer-events-none absolute top-0 left-0 right-0 z-[25] h-[var(--rf-titlebar-h)] bg-[#271C18]"
                aria-hidden
              />
            ) : null}
            <div
              className={
                settingsTabsDocked
                  ? "pointer-events-auto fixed top-0 z-[30] flex h-[var(--rf-titlebar-h)] items-center overflow-hidden"
                  : "pointer-events-none absolute left-6 top-0 z-[30] flex h-[var(--rf-tab-strip-h)] items-start"
              }
              style={settingsTabsDocked ? { left: settingsTabDockLeft } : undefined}
            >
              <motion.div
                className={
                  settingsTabsDocked
                    ? "flex h-[var(--rf-titlebar-h)] items-center"
                    : "flex h-[var(--rf-tab-strip-h)] origin-top-left items-start"
                }
                style={
                  !settingsTabsDocked && settingsScrollable
                    ? { y: settingsTabMorphY }
                    : undefined
                }
              >
              {(
                [
                  "general",
                  "downloads",
                  "playback",
                  "appearance",
                  "advanced",
                  ...(settings.showDebuggingSettings ? (["debugging"] as const) : []),
                ] as const
              ).map((tab) => {
                const isActive = settingsTab === tab;
                const tabLabel =
                  tab === "debugging"
                    ? "DEBUGGING"
                    : tab.toUpperCase();
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSettingsTab(tab)}
                    className={`relative flex cursor-pointer justify-center pointer-events-auto transition-[height,padding] duration-200 ${
                      settingsTabsDocked
                        ? "h-[var(--rf-titlebar-h)] items-center px-4"
                        : "h-[var(--rf-tab-strip-h)] items-end px-6 pb-2"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId={settingsTabShapeLayout ? "settingsTabShape" : undefined}
                        layout={settingsTabShapeLayout}
                        className={`pointer-events-none absolute inset-0 z-0 bg-[#271C18] ${
                          settingsTabsDocked
                            ? "rounded-b-xl"
                            : showSettingsTabBulge
                              ? "rounded-b-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                              : "rounded-b-[24px]"
                        }`}
                        style={
                          showSettingsTabBulge
                            ? {
                                clipPath:
                                  "inset(var(--rf-titlebar-h) -100px -100px -100px)",
                              }
                            : undefined
                        }
                        transition={{
                          layout: { type: "spring", bounce: 0.2, duration: 0.6 },
                        }}
                      >
                        {showSettingsTabBulge ? (
                          <>
                            <div className="absolute left-[-16px] top-[var(--rf-titlebar-h)] w-[16px] h-[16px] text-[#271C18]">
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
                            </div>
                            <div className="absolute right-[-16px] top-[var(--rf-titlebar-h)] w-[16px] h-[16px] text-[#271C18]">
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M0 0V16C0 7.16344 7.16344 0 16 0H0Z" fill="currentColor" /></svg>
                            </div>
                          </>
                        ) : null}
                      </motion.div>
                    )}
                    <span
                      className={`relative z-10 font-medium text-[11px] uppercase tracking-[0.05em] transition-colors ${
                        isActive
                          ? "text-[color:var(--accent)]"
                          : "text-stone-400 hover:text-stone-50"
                      }`}
                    >
                      {tabLabel}
                    </span>
                  </button>
                );
              })}
              </motion.div>
            </div>
            </motion.div>
          ) : (activeTab === "media" && !selectedPlaylist && !shellBlocked) ? (
            <motion.div
              key="gallery-tabs"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute left-6 top-0 z-20 flex items-start h-[var(--rf-tab-strip-h)] pointer-events-none"
            >
              {(['all', 'in-progress', 'watched'] as const).map((t) => {
                const isActive = galleryFilter === t;
                const label = t === 'all' ? 'All' : t === 'in-progress' ? 'In Progress' : 'Watched';
                return (
                  <button
                    key={t}
                    onClick={() => setGalleryFilter(t)}
                    className="relative flex h-[var(--rf-tab-strip-h)] px-6 items-end pb-2 justify-center cursor-pointer pointer-events-auto group/tab"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="galleryTabShape"
                        className="absolute inset-0 bg-[#271C18] rounded-b-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-0"
                        style={{
                          clipPath:
                            "inset(var(--rf-titlebar-h) -100px -100px -100px)",
                        }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      >
                        <div className="absolute left-[-16px] top-[var(--rf-titlebar-h)] w-[16px] h-[16px] text-[#271C18]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
                        </div>
                        <div className="absolute right-[-16px] top-[var(--rf-titlebar-h)] w-[16px] h-[16px] text-[#271C18]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M0 0V16C0 7.16344 7.16344 0 16 0H0Z" fill="currentColor" /></svg>
                        </div>
                      </motion.div>
                    )}
                    <span className={`font-black text-[10px] uppercase tracking-[0.2em] transition-colors relative z-10 ${isActive ? "text-[color:var(--accent)]" : "text-stone-500 group-hover/tab:text-stone-300"}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Gallery search/settings tab bulge */}
        {(activeTab === "media" && !shellBlocked) && (
          <div className="absolute right-6 top-0 z-20 flex h-[var(--rf-tab-strip-h)] pointer-events-none">
            <div
              className="relative flex h-[var(--rf-tab-strip-h)] bg-[#271C18] rounded-b-[28px] px-6 items-end pb-1 justify-end pointer-events-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
              style={{
                clipPath: "inset(var(--rf-titlebar-h) -100px -100px -100px)",
              }}
            >
              <div className="absolute left-[-16px] top-[var(--rf-titlebar-h)] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
              </div>
              <div className="absolute right-[-16px] top-[var(--rf-titlebar-h)] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M0 0V16C0 7.16344 7.16344 0 16 0H0Z" fill="currentColor" /></svg>
              </div>

              <div className="flex items-center gap-5 h-[34px] flex-shrink-0">
                <AnimatePresence>
                  {isSearchExpanded && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 240, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden h-[34px] flex items-center relative z-10 flex-shrink-0"
                    >
                      <div className="w-[240px] pr-5">
                        <input
                          ref={searchInputRef}
                          className="w-full bg-black/20 border border-stone-50/5 rounded-full px-4 py-1.5 text-xs text-stone-50 placeholder-stone-500 outline-none focus:border-[color-mix(in_srgb,var(--accent),transparent_50%)] transition-colors"
                          placeholder="Search library..."
                          value={searchValue}
                          onChange={(e) => setSearchValue(e.target.value)}
                          onBlur={(e) => {
                            if (e.relatedTarget?.id === "search-toggle-btn") return;
                            if (!e.target.value) setIsSearchExpanded(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setIsSearchExpanded(false);
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  id="search-toggle-btn"
                  onClick={() => setIsSearchExpanded((p) => !p)}
                  className={`transition-colors relative z-10 flex-shrink-0 ${isSearchExpanded ? "text-stone-50" : "text-stone-400 hover:text-stone-50"}`}
                >
                  <Search size={16} />
                </button>
                <button
                  type="button"
                  id="recently-deleted-btn"
                  onClick={() => setRecentlyDeletedOpen(true)}
                  className="text-stone-400 hover:text-stone-50 transition-colors relative z-10 flex-shrink-0"
                  aria-label="Recently deleted"
                  title="Recently deleted"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="text-stone-400 hover:text-stone-50 transition-colors relative z-10 flex-shrink-0"
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Content ─────────────────────────────── */}
        <div className="flex-1 relative z-0 bg-[#1D1613] rounded-tl-[32px] overflow-hidden rf-main-content-shell">
          {activeTab === "explorer" && !shellBlocked ? (
            <div
              ref={explorerWebviewHostRef}
              className="fixed z-[1] top-10 bottom-0 right-0 pointer-events-none"
              style={{ left: sidebarChromeLeft }}
              aria-hidden
            />
          ) : null}
          <div
            className="rf-main-content-vignette pointer-events-none absolute inset-0 z-[15] rounded-tl-[32px]"
            aria-hidden
          />
          <UpdaterMainOverlays
            phase={updaterPhase}
            version={updaterVersion}
            notes={availableUpdatePayload?.notes ?? ""}
            additions={availableUpdatePayload?.additions}
            fixes={availableUpdatePayload?.fixes}
            onInstallRestart={() => void handleInstallRestart()}
            onDismiss={() => setUpdaterTeaserDismissed(true)}
            dismissed={updaterTeaserDismissed}
          />
          {isMainUrlDropHover ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[25] rounded-tl-[32px] border-2 border-dashed border-[color:color-mix(in_srgb,var(--accent),transparent_55%)] bg-[color:color-mix(in_srgb,var(--accent),transparent_93%)]"
            />
          ) : null}
          <main
            ref={assignMainScrollAndUrlDropRef}
            className={`absolute inset-0 min-h-full bg-[#1D1613] ${activeTab === "explorer" ? "overflow-hidden" : "overflow-y-auto"}`}
          >
            <AnimatePresence mode="wait">
              {activeTab === "downloader" && (
                <DownloaderView
                  key="downloader"
                  internalDir={RUFORGE_INTERNAL_DIR}
                  storageFull={storageBlocksNewDownloads}
                />
              )}
              {activeTab === "explorer" && (
                <div key="explorer" className="absolute inset-0 min-h-0" aria-hidden />
              )}
              {activeTab === "media" && (
                selectedPlaylist ? (
                  <PlaylistDetailView 
                    key={`playlist-${selectedPlaylist.path}`}
                    playlist={selectedPlaylist}
                    onBack={() => setSelectedPlaylist(null)}
                  />
                ) : (
                  <MediaView 
                    key="media" 
                    onPlaylistClick={(p) => setSelectedPlaylist(p)}
                  />
                )
              )}
              {activeTab === "player" && playingFile && isAudioOnlyPath(playingFile.path) && (
                <PlayerView
                  ref={playerViewRef}
                  key={`player-${playingFile.path}`}
                  onBack={() => setActiveTab("media")}
                />
              )}
              {activeTab === "settings" && (
                <SettingsView key="settings" />
              )}
            </AnimatePresence>
          </main>

          {/* Toast Notifications */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none max-w-[min(100vw-2rem,22rem)]">
            <AnimatePresence>
              {notifications.map((n) => {
                const t = n.type ?? "info";
                const shell =
                  t === "error"
                    ? "rf-notify-card text-stone-100 border border-rose-400/30"
                    : t === "progress"
                      ? "rf-notify-card text-stone-50 border border-white/10"
                      : t === "warning"
                        ? "rf-notify-card text-stone-50 border-2 border-dotted border-amber-300/70"
                        : "rf-notify-card text-stone-50 border border-white/10";
                const closeBtn =
                  t === "error"
                    ? "text-red-200/70 hover:text-red-100"
                    : t === "warning"
                      ? "text-yellow-200/55 hover:text-yellow-100/90"
                      : "text-stone-500 hover:text-stone-300";
                return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  style={{ willChange: "opacity, transform" }}
                  className="rounded-xl pointer-events-auto min-w-0 w-full overflow-hidden"
                >
                  <div className={`${shell} px-3 py-2 flex items-center gap-2.5 min-w-0 w-full rounded-xl`}>
                    {t === "error" ? (
                      <AlertCircle className="text-red-400 w-4 h-4 flex-shrink-0" />
                    ) : t === "progress" ? (
                      <Loader2 className="text-[color:var(--accent)] w-4 h-4 flex-shrink-0 animate-spin" />
                    ) : t === "warning" ? (
                      <HardDrive className="text-yellow-400/95 w-4 h-4 flex-shrink-0" aria-hidden />
                    ) : (
                      <CheckCircle2 className="text-emerald-400 w-4 h-4 flex-shrink-0" />
                    )}

                    <div className="flex-1 flex flex-col min-w-0">
                      <span className="text-xs font-semibold leading-snug">
                        {n.message}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => dismissNotification(n.id)}
                      className={`${closeBtn} transition-colors flex-shrink-0 self-start p-0.5 rounded`}
                      aria-label="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
      </>
      )}

      {backgroundVideoFile ? (
        <div
          className={
            videoPlayerShellVisible
              ? "pointer-events-auto fixed z-[40] top-[var(--rf-titlebar-h)] bottom-0 right-0 overflow-hidden bg-[#1D1613] rounded-tl-[32px]"
              : "pointer-events-none fixed left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0"
          }
          style={videoPlayerShellVisible ? { left: sidebarChromeLeft } : undefined}
          aria-hidden={!videoPlayerShellVisible}
        >
          <PlayerView
            ref={playerViewRef}
            key={`player-${backgroundVideoFile.path}`}
            onBack={() => setActiveTab("media")}
          />
        </div>
      ) : null}

      {postInstall && (
        <UpdaterPostInstallStack
          version={postInstall.version}
          notes={postInstall.notes}
          additions={postInstall.additions}
          fixes={postInstall.fixes}
          onDismiss={() => setPostInstall(null)}
          onOpenChangelog={() => void openUrl(RELEASES_PAGE)}
        />
      )}
      {onboardingOpen && !postInstall && (
        <OnboardingFlow onComplete={() => setOnboardingOpen(false)} />
      )}

      <UpdaterFullWindowUpdate
        phase={updaterPhase}
        downloaded={updaterDownloaded}
        contentLength={updaterContentLength}
      />

      <AuthorizeCleanupModal />
      <RecentlyDeletedModal
        open={recentlyDeletedOpen}
        onClose={() => setRecentlyDeletedOpen(false)}
      />
      <ExportBundleHost />
      <ConfirmDialogHost />
    </div>
    </MainPlaybackHost>
  );
}

export default App;

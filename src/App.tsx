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
import { useUrlDropIntake } from "./features/downloader/useUrlDropIntake";
import { getYoutubeUrlDropHandler } from "./features/downloader/youtubeUrlDropRegistry";
import { notifyWhenUnfocused } from "./systemNotify";
import { check, Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
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
import logo from "./assets/neotubeIcon.png";
import MiniPlayer from "./MiniPlayer";
import { isAudioOnlyPath } from "./mediaKind";
import { flattenGalleryScanToMediaFiles } from "./galleryScan";
import { ExplorerWatchQueueButton } from "./components/ExplorerWatchQueueButton";
import { TitlebarHoverButton } from "./components/TitlebarHoverButton";
import { DownloaderView } from "./components/DownloaderView";
import { PlayerView, type PlayerViewHandle } from "./components/PlayerView";
import { SettingsView } from "./components/SettingsView";
import { MediaView } from "./components/MediaView";
import { AuthorizeCleanupModal } from "./components/AuthorizeCleanupModal";
import type { SendToMainPayload } from "./playerHandoff";
import { PlaylistDetailView } from "./components/PlaylistDetailView";
import { MediaFile } from "./types";
import { readPlaybackSpeed } from "./playbackSpeedStorage";
import {
  Download,
  Settings,
  Search,
  CheckCircle2,
  X,
  Youtube,
  Database,
  Trash2,
  Globe,
  Loader2,
  AlertCircle,
  HardDrive,
} from "lucide-react";

import { useRuforgeStore, RUFORGE_INTERNAL_DIR, type ActiveTab } from "./store/ruforgeStore";
import type { DownloadJobFinishedPayload } from "./downloadQueue";
import { normalizeProgressPayload, type ProgressPayload } from "./types";
import {
  EMBEDDED_EXPLORER_WEBVIEW_LABEL,
  EXPLORER_PAUSE_MEDIA_SCRIPT,
  explorerNavigateOrReloadScript,
} from "./explorerWebviewLifecycle";

const WindowControls = ({ 
  onMiniPlayerToggle,
  updaterPhase,
  updaterVersion,
  showExplorerQueueToolbar,
  storageBlocksNewDownloads,
  onUpdaterStatusClick,
}: { 
  onMiniPlayerToggle: () => void,
  updaterPhase: UpdaterPhase,
  updaterVersion: string | null,
  showExplorerQueueToolbar: boolean,
  storageBlocksNewDownloads: boolean,
  onUpdaterStatusClick?: () => void,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const updateMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };
    updateMaximized();
    
    let unlistenFn: (() => void) | null = null;
    appWindow.onResized(updateMaximized).then(f => {
      unlistenFn = f;
    });

    return () => {
      if (typeof unlistenFn === 'function') {
        unlistenFn();
      }
    };
  }, [appWindow]);

  return (
    <div className="fixed top-0 right-0 z-[100] flex items-center h-10 pr-2 pointer-events-auto">
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

      <TitlebarHoverButton
        tooltip="Launch Mini Player"
        onClick={onMiniPlayerToggle}
      >
        <Icon icon="material-symbols:ad-group-outline" width={18} height={18} />
      </TitlebarHoverButton>

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

const StorageWidget = () => {
  const stats = useRuforgeStore((s) => s.storageStats);
  const limitGB = useRuforgeStore((s) => s.settings.storageLimitGB);
  const onAuthorizeCleanup = useRuforgeStore((s) => s.openAuthorizeCleanupModal);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const isExpanded = useRuforgeStore((s) => s.isSidebarExpanded);

  if (!stats) return null;

  const usedGB = stats.total_bytes / (1024 * 1024 * 1024);
  const isManaged = saveToInternal;
  const percentage = isManaged ? Math.min((usedGB / limitGB) * 100, 100) : Math.min(usedGB * 8, 100);
  const isFull = isManaged && usedGB >= limitGB;
  const isWarning = isManaged && usedGB >= limitGB * 0.8;

  return (
    <div className="px-5 mb-6 mt-auto flex-shrink-0">
      <div className={`flex flex-col gap-3 ${!isExpanded ? 'items-center' : ''}`}>
        <div className="flex flex-col items-center gap-1.5">
          <Database size={isExpanded ? 12 : 20} className={isFull ? "text-[color:var(--accent)]" : "text-stone-600"} />
          {isExpanded && (
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-stone-500 whitespace-nowrap">
              Storage
            </span>
          )}
        </div>

        {isExpanded && (
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-[9px] font-black tracking-widest ${isFull ? "text-[color:var(--accent)]" : "text-stone-600"} whitespace-nowrap`}>
                {usedGB.toFixed(1)}G
              </span>

              <div className="h-1 flex-1 bg-white/[0.03] rounded-full overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  className={`h-full rounded-full transition-colors duration-500 ${
                    isFull ? "bg-[color:var(--accent)]" : isWarning ? "bg-[color:var(--accent)] opacity-50" : "bg-stone-700"
                  }`}
                />
                {isFull && (
                  <motion.div
                    animate={{ opacity: [0.2, 0.5, 0.2] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-[color:var(--accent)] blur-sm"
                  />
                )}
              </div>

              <span className={`text-[9px] font-black tracking-widest ${isFull ? "text-[color:var(--accent)]" : "text-stone-600"} whitespace-nowrap`}>
                {isManaged ? `${limitGB}G` : `${stats.file_count}`}
              </span>
            </div>

            {isManaged && isFull && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => void onAuthorizeCleanup()}
                className="flex w-full items-center justify-center gap-2 py-2 border border-[color-mix(in_srgb,var(--accent),transparent_80%)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_92%)] rounded-xl text-[8px] font-black text-[color:var(--accent)] transition-all uppercase tracking-widest whitespace-nowrap"
              >
                <Trash2 size={10} />
                Authorize Cleanup
              </motion.button>
            )}
          </div>
        )}
      </div>
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
  const isSidebarExpanded = useRuforgeStore((s) => s.isSidebarExpanded);
  const toggleSidebar = useRuforgeStore((s) => s.toggleSidebar);
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
  const [isMini, setIsMini] = useState(false);
  const isSearchExpanded = useRuforgeStore((s) => s.isSearchExpanded);
  const setIsSearchExpanded = useRuforgeStore((s) => s.setIsSearchExpanded);
  const searchValue = useRuforgeStore((s) => s.searchValue);
  const setSearchValue = useRuforgeStore((s) => s.setSearchValue);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  /** 0 = bulge tabs flush on panel; 1 = tucked into the 40px title band (scrollable settings only). */
  const settingsTabMorph = useMotionValue(0);
  const settingsTabMorphY = useTransform(settingsTabMorph, [0, 1], [0, -40]);
  const settingsTabMorphScale = useTransform(settingsTabMorph, [0, 1], [1, 0.94]);
  const settingsTabShapeOpacity = useTransform(settingsTabMorph, [0, 0.35, 0.55], [1, 1, 0]);
  const [settingsMorphAmount, setSettingsMorphAmount] = useState(0);
  const [settingsScrollable, setSettingsScrollable] = useState(false);
  const settingsTabsDocked = settingsMorphAmount > 0.55;
  const settingsTabShapeLayout = settingsMorphAmount < 0.02;
  useMotionValueEvent(settingsTabMorph, "change", setSettingsMorphAmount);
  const settingsTabDockLeft = isSidebarExpanded ? 264 : 104;
  const notifications = useRuforgeStore((s) => s.notifications);
  const dismissNotification = useRuforgeStore((s) => s.dismissNotification);
  const notify = useRuforgeStore((s) => s.notify);
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

  const explorerContainerRef = useRef<HTMLDivElement>(null);
  const explorerWebviewRef = useRef<Webview | null>(null);
  const prevActiveTabRef = useRef<ActiveTab>(activeTab);
  /** One reload when entering Explorer; layout sync must not re-arm this. */
  const explorerReloadPendingRef = useRef(false);
  const downloadFinishedNotifyGuardRef = useRef<Set<string>>(new Set());
  const applyDownloadProgress = useRuforgeStore((s) => s.applyDownloadProgress);
  const onDownloadJobFinished = useRuforgeStore((s) => s.onDownloadJobFinished);
  const onDownloadJobPaused = useRuforgeStore((s) => s.onDownloadJobPaused);
  const invalidateEntries = useRuforgeStore((s) => s.invalidateEntries);
  const playerViewRef = useRef<PlayerViewHandle>(null);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const storageStats = useRuforgeStore((s) => s.storageStats);
  const lastExplorerUrl = useRuforgeStore((s) => s.lastExplorerUrl);
  const setLastExplorerUrl = useRuforgeStore((s) => s.setLastExplorerUrl);
  const lastExplorerUrlRef = useRef(lastExplorerUrl);
  lastExplorerUrlRef.current = lastExplorerUrl;
  const storageBlocksNewDownloads =
    saveToInternal &&
    (storageStats
      ? storageStats.total_bytes / (1024 * 1024 * 1024) >= settings.storageLimitGB
      : false);
  const setSidebarCollapsedByResize = useRuforgeStore((s) => s.setSidebarCollapsedByResize);

  const updateRef = useRef<Update | null>(null);
  const [updaterPhase, setUpdaterPhase] = useState<UpdaterPhase>("idle");
  const [updaterVersion, setUpdaterVersion] = useState<string | null>(null);
  const [, setUpdaterNotes] = useState("");
  const [updaterDownloaded, setUpdaterDownloaded] = useState(0);
  const [updaterContentLength, setUpdaterContentLength] = useState<number | undefined>(undefined);
  const [updaterTeaserDismissed, setUpdaterTeaserDismissed] = useState(false);
  const [postInstall, setPostInstall] = useState<PostInstallPayload | null>(null);

  const handleInstallRestart = useCallback(async () => {
    const u = updateRef.current;
    if (!u) return;
    setUpdaterDownloaded(0);
    setUpdaterContentLength(undefined);
    setUpdaterPhase("downloading");
    setPendingPostInstall(buildPostInstallPayload(u.version, u.body ?? "")); 
    try {
      await u.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setUpdaterContentLength(event.data.contentLength);
        } else if (event.event === "Progress") {
          setUpdaterDownloaded((d) => d + event.data.chunkLength);
        } else if (event.event === "Finished") {
          setUpdaterPhase("installing");
        }
      });
    } catch (e) {
      console.error(e);
      clearPendingPostInstall();
      setUpdaterPhase("available");
      notify(
        "Update failed. Check your connection, or install the latest build from GitHub Releases.",
        "error",
      );
    }
  }, [notify]);

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
    void refreshStorageStats();
  }, [refreshStorageStats, outputDir, saveToInternal]);

  const onDownloadSuccess = useCallback(() => {
    notify("Complete");
    void notifyWhenUnfocused({
      body: "Download finished. Your file is ready.",
      kind: "info",
    });
    void refreshStorageStats();
    const jobs = useRuforgeStore.getState().downloadJobs;
    const busy = jobs.some(
      (j) => j.status === "queued" || j.status === "downloading",
    );
    if (!busy) setActiveTab("media");
  }, [notify, refreshStorageStats, setActiveTab]);

  const onDownloadError = useCallback((err: string) => {
    const line = err.split("\n")[0];
    notify(`Failed: ${line}`);
    void notifyWhenUnfocused({
      body: `Failed: ${line}`,
      kind: "error",
    });
  }, [notify]);

  // Single app-level IPC registration (DownloaderView unmounts on tab change).
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let disposed = false;

    const register = async () => {
      const uProgress = await listen<ProgressPayload & { job_id?: string }>(
        "download-progress",
        (event) => {
          const normalized = normalizeProgressPayload(event.payload);
          if (!normalized) return;
          applyDownloadProgress(normalized);
        },
      );
      if (disposed) {
        uProgress();
        return;
      }
      unsubs.push(uProgress);

      const uFinished = await listen<DownloadJobFinishedPayload>(
        "download-job-finished",
        (event) => {
          const payload = event.payload;
          if (downloadFinishedNotifyGuardRef.current.has(payload.jobId)) return;
          downloadFinishedNotifyGuardRef.current.add(payload.jobId);
          onDownloadJobFinished(payload);
          if (payload.success) {
            void invalidateEntries({ silent: true }).then(() => {
              onDownloadSuccess();
            });
          } else {
            onDownloadError(payload.error ?? "Download failed");
          }
        },
      );
      if (disposed) {
        uFinished();
        return;
      }
      unsubs.push(uFinished);

      const uPaused = await listen<string>("download-job-paused", (event) => {
        onDownloadJobPaused(event.payload);
      });
      if (disposed) {
        uPaused();
        return;
      }
      unsubs.push(uPaused);
    };

    void register();
    return () => {
      disposed = true;
      for (const u of unsubs) u();
    };
  }, [
    applyDownloadProgress,
    onDownloadJobFinished,
    onDownloadJobPaused,
    invalidateEntries,
    onDownloadSuccess,
    onDownloadError,
  ]);

  const addLog = useCallback((msg: string) => {
    console.log("[Explorer Debug]", msg);
  }, []);

  // Manage Embedded Explorer Webview.
  // Deps: `activeTab`, layout (`isSidebarExpanded`) — URL poll updates store only; read via lastExplorerUrlRef.
  useEffect(() => {
    let active = true;
    let interval: number | undefined;
    const wasOnExplorer = prevActiveTabRef.current === "explorer";
    const onExplorer = activeTab === "explorer";
    const enteringExplorer = !wasOnExplorer && onExplorer;
    prevActiveTabRef.current = activeTab;
    if (enteringExplorer) {
      explorerReloadPendingRef.current = true;
    }
    if (!onExplorer) {
      explorerReloadPendingRef.current = false;
    }

    const pauseExplorerMedia = async () => {
      try {
        await invoke("eval_in_webview", {
          label: EMBEDDED_EXPLORER_WEBVIEW_LABEL,
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
          label: EMBEDDED_EXPLORER_WEBVIEW_LABEL,
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

    const syncWebview = async () => {
      if (!active) return;
      const appWindow = getCurrentWindow();
      
      if (onExplorer) {
        if (!explorerContainerRef.current) {
          addLog("Container ref is null");
          return;
        }
        
        const rect = explorerContainerRef.current.getBoundingClientRect();
        // Webview now fills the container entirely for better immersion
        const finalX = Math.round(rect.left);
        const finalY = Math.round(rect.top);
        const finalW = Math.round(rect.width);
        const finalH = Math.round(rect.height);

        addLog(`Rect: w=${finalW}, h=${finalH}, x=${finalX}, y=${finalY}`);
        
        if (finalW <= 0 || finalH <= 0) {
          addLog("Skipping: Width or Height is <= 0");
          return;
        }

        if (!explorerWebviewRef.current) {
          addLog("Creating new Webview instance...");
          try {
            const dataDir = await appDataDir();
            const explorerDataPath = await join(dataDir, "explorer-data");
            const extraBrowserArgs = await invoke<string | null>("get_hardware_acceleration_browser_args");
            
            const webview = new Webview(appWindow, 'explorer-view', {
              url: 'https://www.youtube.com',
              x: finalX,
              y: finalY,
              width: finalW,
              height: finalH,
              dataDirectory: explorerDataPath,
              userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              ...(extraBrowserArgs ? { additionalBrowserArgs: extraBrowserArgs } : {}),
            });
            
            webview.once('tauri://created', () => {
              addLog("Webview successfully created!");
              explorerWebviewRef.current = webview;
              if (active && activeTab === "explorer") {
                void maybeReloadExplorerOnEnter();
              }
            });
            
            webview.once('tauri://error', (e) => {
              addLog(`Webview error: ${JSON.stringify(e)}`);
            });
            
            explorerWebviewRef.current = webview;
          } catch (e: any) {
            addLog(`Creation failed: ${e?.message || String(e)}`);
          }
        } else {
          try {
            await explorerWebviewRef.current.show();
            await explorerWebviewRef.current.setPosition(new LogicalPosition(finalX, finalY));
            await explorerWebviewRef.current.setSize(new LogicalSize(finalW, finalH));
            await maybeReloadExplorerOnEnter();
          } catch (e: any) {
             addLog(`Update failed: ${e?.message || String(e)}`);
          }
        }
      } else {
        if (wasOnExplorer) {
          await pauseExplorerMedia();
        }
        if (explorerWebviewRef.current) {
          try {
            addLog("Hiding Webview...");
            await explorerWebviewRef.current.hide();
          } catch (e: any) {
            addLog(`Hide failed: ${e?.message || String(e)}`);
            console.error("Webview hide failed", e);
          }
        }
      }
    };

    const scheduleSync = () => {
      void syncWebview();
    };

    // Run immediately (layout + hide when leaving Explorer).
    scheduleSync();
    if (onExplorer) {
      // Fallback while ResizeObserver / resize events are settling (e.g. sidebar width transition).
      interval = window.setInterval(scheduleSync, 200);
    }

    window.addEventListener("resize", scheduleSync);

    let resizeObserver: ResizeObserver | undefined;
    const attachResizeObserver = () => {
      const el = explorerContainerRef.current;
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
      if (interval !== undefined) {
        clearInterval(interval);
      }
      window.removeEventListener("resize", scheduleSync);
      cancelAnimationFrame(resizeObserverRaf);
      resizeObserver?.disconnect();
      unlistenWindowResize?.();
    };
  }, [activeTab, addLog, isSidebarExpanded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await check();
        if (cancelled) {
          void next?.close().catch(() => {});
          return;
        }
        if (!next) return;
        if (updateRef.current) {
          void updateRef.current.close().catch(() => {});
        }
        updateRef.current = next;
        setUpdaterVersion(next.version);
        setUpdaterNotes(teaserNotesFromUpdaterBody(next.body ?? ""));
        setUpdaterPhase("available");
      } catch (e) {
        console.error("Update check failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const pending = consumePendingPostInstall();
    if (pending) setPostInstall(pending);
  }, []);

  // Auto-collapse sidebar on narrow windows
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1100) {
        setSidebarCollapsedByResize();
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [setSidebarCollapsedByResize]);

  // Detect mini player window
  useEffect(() => {
    const checkWindow = async () => {
      try {
        const win = getCurrentWindow();
        if (win.label === "mini") setIsMini(true);
      } catch (e) {
        console.error("Window detection failed", e);
      }
    };
    checkWindow();
  }, []);

  // Focus search on expand
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

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
      // Mini claims playback: clear file and leave the player tab in one update so we never sit on
      // `activeTab === "player"` with a null `playingFile` (Zustand can re-render PlayerView before React commits removal).
      if (event.payload === "mini-player") {
        useRuforgeStore.setState((s) => ({
          playingFile: null,
          activeTab: s.activeTab === "player" ? "media" : s.activeTab,
        }));
        return;
      }
      useRuforgeStore.getState().stopPlayback();
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
      unlistenDebugUpdater.then((f) => f());
    };
  }, []);

  // Send-to-main handoff from miniplayer
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

  // System tray "Show" — event name must match `TRAY_SHOW_MAIN_EVENT` in `src-tauri/src/tray.rs`.
  // Uses the official JS `WebviewWindow` APIs (`unminimize` / `show` / `setFocus`), same layer as
  // https://v2.tauri.app/learn/system-tray/ (JS menu `action` / window helpers).
  // Debug lines go to the **terminal** via `invoke("tray_front_debug")` → Rust `eprintln!`.
  useEffect(() => {
    const trayDbg = (line: string) =>
      invoke("tray_front_debug", { line }).catch(() => {});
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
        const dir = await dirname(playingFile.path);
        const scannedRaw = await invoke("scan_gallery", { dir });
        if (cancel) return;
        const scanned = flattenGalleryScanToMediaFiles(scannedRaw);
        
        // Populate neighbor queue from the same folder, matching the current media type (audio or video)
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
  }, []);

  useEffect(() => {
    if (activeTab !== "explorer" || postInstall) return;
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
  }, [activeTab, postInstall, setLastExplorerUrl]);

  useEffect(() => {
    if (activeTab !== "settings" || postInstall) {
      settingsTabMorph.set(0);
      setSettingsMorphAmount(0);
      setSettingsScrollable(false);
      return;
    }

    const morphPx = 72;
    let el = mainContentRef.current;
    let detach: (() => void) | undefined;

    const bind = () => {
      detach?.();
      el = mainContentRef.current;
      if (!el) return;

      const apply = () => {
        const scrollable = el!.scrollHeight > el!.clientHeight + 2;
        setSettingsScrollable(scrollable);
        if (!scrollable) {
          settingsTabMorph.set(0);
          return;
        }
        settingsTabMorph.set(Math.min(1, el!.scrollTop / morphPx));
      };

      apply();
      el.addEventListener("scroll", apply, { passive: true });
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      detach = () => {
        el!.removeEventListener("scroll", apply);
        ro.disconnect();
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
  }, [activeTab, postInstall, settingsTab, settingsTabMorph]);

  if (isMini) return <MiniPlayer />;

  const navItems = [
    { id: "downloader" as ActiveTab, icon: Download, label: "Download" },
    { id: "media" as ActiveTab, icon: Youtube, label: "Videos" },
    { id: "explorer" as ActiveTab, icon: Globe, label: "Explorer" },
    { id: "settings" as ActiveTab, icon: Settings, label: "System" },
  ];

  return (
    <div className="h-screen w-screen bg-[#271C18] text-stone-50 font-sans flex overflow-hidden select-none relative">
      
      {/* Window Controls */}
      <WindowControls
        onMiniPlayerToggle={() => {
          const st = useRuforgeStore.getState();
          const inPlayer = st.activeTab === "player";
          void st.handlePopOut(inPlayer ? (playerViewRef.current?.getCurrentTime() ?? 0) : undefined, {
            paused: inPlayer ? (playerViewRef.current?.getIsPaused() ?? true) : true,
            playbackSpeed: readPlaybackSpeed(),
          });
        }}
        updaterPhase={updaterPhase}
        updaterVersion={updaterVersion}
        showExplorerQueueToolbar={activeTab === "explorer" && !postInstall}
        storageBlocksNewDownloads={storageBlocksNewDownloads}
        onUpdaterStatusClick={() => setUpdaterTeaserDismissed(false)}
      />

      {/* Global Drag Region - Top strip except controls area */}
      <div className="fixed top-0 left-0 right-[200px] h-10 z-[50]" data-tauri-drag-region />

      {/* ── Sidebar ─────────────────────────────────────── */}
      <div className={`${isSidebarExpanded ? 'w-[240px]' : 'w-[80px]'} flex-shrink-0 relative z-20 flex flex-col bg-transparent overflow-hidden transition-[width,opacity,filter] duration-500 ease-[0.23,1,0.32,1] ${postInstall ? 'opacity-30 grayscale-[50%] pointer-events-none' : ''}`}>
        {/* Logo container */}
        <div
          className="h-[72px] flex min-w-0 flex-shrink-0 items-center px-5 cursor-default"
          data-tauri-drag-region
        >
          <div className="pointer-events-none flex shrink-0 items-center gap-3">
            <img src={logo} className="w-10 h-10 rounded-xl shadow-xl object-cover" alt="RuForge" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center ${isSidebarExpanded ? 'gap-4 px-3.5' : 'justify-center'} py-3.5 rounded-2xl transition-all duration-200 relative group overflow-hidden ${
                  isActive
                    ? "bg-[color-mix(in_srgb,var(--accent),transparent_88%)] text-[color:var(--accent)]"
                    : "text-stone-500 hover:text-stone-200 hover:bg-white/[0.04]"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="navGlow"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full"
                    style={{ backgroundColor: "var(--accent)" }}
                    transition={{ type: "spring", bounce: 0.25, duration: 0.4 }}
                  />
                )}
                <item.icon
                  size={18}
                  className={`flex-shrink-0 ${isActive ? "text-[color:var(--accent)]" : "text-stone-600 group-hover:text-stone-300"}`}
                />
                <AnimatePresence mode="popLayout">
                  {isSidebarExpanded && (
                    <motion.span 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="font-black text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                
                {!isSidebarExpanded && !isActive && (
                  <div className="absolute left-full ml-6 px-3 py-1.5 bg-stone-900 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-stone-100 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Storage Manager */}
        <StorageWidget />

        {/* Sidebar Toggle at Bottom */}
        <div className="p-4 mt-auto">
          <button 
            onClick={toggleSidebar}
            className={`w-full h-11 flex items-center ${isSidebarExpanded ? 'justify-start px-4' : 'justify-center'} text-stone-500 hover:text-[color:var(--accent)] transition-all active:scale-95 group/toggle`}
          >
            <motion.div
              animate={{ rotate: isSidebarExpanded ? 0 : 180 }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            >
              <Icon icon="ic:twotone-subdirectory-arrow-left" fontSize={22} className="opacity-60 group-hover/toggle:opacity-100" />
            </motion.div>
            
            <AnimatePresence mode="popLayout">
              {isSidebarExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.3 }}
                  className="ml-4 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap"
                >
                  Collapse
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* ── Right Column ────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 pt-[40px] relative z-10">

        {/* Settings / Gallery tab strip */}
        <AnimatePresence mode="wait">
          {(activeTab === "settings" && !postInstall) ? (
            <motion.div
              key="settings-tabs"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={
                settingsTabsDocked
                  ? "pointer-events-auto fixed top-0 z-[60] flex h-10 items-center"
                  : "pointer-events-none absolute left-6 top-0 z-20 flex h-[80px] items-start"
              }
              style={settingsTabsDocked ? { left: settingsTabDockLeft } : undefined}
            >
              <motion.div
                className={
                  settingsTabsDocked
                    ? "flex h-10 items-center"
                    : "flex h-[80px] origin-top-left items-start"
                }
                style={
                  !settingsTabsDocked && settingsScrollable
                    ? { y: settingsTabMorphY, scale: settingsTabMorphScale }
                    : undefined
                }
              >
              {(["general", "downloads", "appearance", "advanced"] as const).map((tab) => {
                const isActive = settingsTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSettingsTab(tab)}
                    className={`relative flex cursor-pointer justify-center pointer-events-auto transition-[height,padding] duration-200 ${
                      settingsTabsDocked
                        ? "h-10 items-center px-4"
                        : "h-[80px] items-end px-6 pb-2"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId={settingsTabShapeLayout ? "settingsTabShape" : undefined}
                        layout={settingsTabShapeLayout}
                        className={`pointer-events-none absolute inset-0 z-0 bg-[#271C18] rounded-b-[24px] ${
                          settingsTabsDocked ? "" : "shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                        }`}
                        style={{
                          clipPath: "inset(40px -100px -100px -100px)",
                          opacity: settingsTabShapeOpacity,
                        }}
                        transition={{
                          layout: { type: "spring", bounce: 0.2, duration: 0.6 },
                          opacity: { duration: 0.15 },
                        }}
                      >
                        <div className="absolute left-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
                        </div>
                        <div className="absolute right-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M0 0V16C0 7.16344 7.16344 0 16 0H0Z" fill="currentColor" /></svg>
                        </div>
                      </motion.div>
                    )}
                    <span
                      className={`relative z-10 font-medium text-[11px] uppercase tracking-[0.05em] transition-colors ${
                        isActive
                          ? "text-[color:var(--accent)]"
                          : "text-stone-400 hover:text-stone-50"
                      }`}
                    >
                      {tab}
                    </span>
                  </button>
                );
              })}
              </motion.div>
            </motion.div>
          ) : (activeTab === "media" && !selectedPlaylist && !postInstall) ? (
            <motion.div
              key="gallery-tabs"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute left-6 top-0 z-20 flex items-start h-[80px] pointer-events-none"
            >
              {(['all', 'in-progress', 'watched'] as const).map((t) => {
                const isActive = galleryFilter === t;
                const label = t === 'all' ? 'All' : t === 'in-progress' ? 'In Progress' : 'Watched';
                return (
                  <button
                    key={t}
                    onClick={() => setGalleryFilter(t)}
                    className="relative flex h-[80px] px-6 items-end pb-2 justify-center cursor-pointer pointer-events-auto group/tab"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="galleryTabShape"
                        className="absolute inset-0 bg-[#271C18] rounded-b-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-0"
                        style={{ clipPath: "inset(40px -100px -100px -100px)" }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      >
                        <div className="absolute left-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
                        </div>
                        <div className="absolute right-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18]">
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

        {/* Explorer bulge */}
        {(activeTab === "explorer" && !postInstall) && (
          <div className="absolute right-6 top-0 z-20 flex h-[80px] pointer-events-none">
            <div
              className="relative flex h-[80px] bg-[#271C18] rounded-b-[28px] px-6 items-end pb-1 justify-end pointer-events-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
              style={{ clipPath: "inset(40px -100px -100px -100px)" }}
            >
              <div className="absolute left-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
              </div>
              <div className="absolute right-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M0 0V16C0 7.16344 7.16344 0 16 0H0Z" fill="currentColor" /></svg>
              </div>

              <div className="flex items-center gap-5 h-[34px] flex-shrink-0">
                <button
                  onClick={async () => {
                    if (explorerWebviewRef.current) {
                      try {
                        await invoke("open_external_url", { url: lastExplorerUrl });
                      } catch (e) {
                        console.error(e);
                      }
                    }
                  }}
                  className="text-stone-400 hover:text-stone-50 transition-colors relative z-10 flex items-center gap-2 px-2"
                  title="Open current page in default browser"
                >
                  <Globe size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Open in Browser</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Gallery search/settings tab bulge */}
        {(activeTab === "media" && !postInstall) && (
          <div className="absolute right-6 top-0 z-20 flex h-[80px] pointer-events-none">
            <div
              className="relative flex h-[80px] bg-[#271C18] rounded-b-[28px] px-6 items-end pb-1 justify-end pointer-events-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
              style={{ clipPath: "inset(40px -100px -100px -100px)" }}
            >
              <div className="absolute left-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
              </div>
              <div className="absolute right-[-16px] top-[40px] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M0 0V16C0 7.16344 7.16344 0 16 0H0Z" fill="currentColor" /></svg>
              </div>

              <AnimatePresence>
                {isSearchExpanded && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 240, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden h-[34px] flex items-center relative z-10"
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

              <div className="flex items-center gap-5 h-[34px] flex-shrink-0">
                <button
                  id="search-toggle-btn"
                  onClick={() => setIsSearchExpanded((p) => !p)}
                  className={`transition-colors relative z-10 ${isSearchExpanded ? "text-stone-50" : "text-stone-400 hover:text-stone-50"}`}
                >
                  <Search size={16} />
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="text-stone-400 hover:text-stone-50 transition-colors relative z-10"
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Content ─────────────────────────────── */}
        <div className="flex-1 relative bg-[#1D1613] rounded-tl-[32px] overflow-hidden shadow-[inset_6px_6px_24px_rgba(0,0,0,0.5)] z-0">
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
          {isMainUrlDropHover ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[25] rounded-tl-[32px] border-2 border-dashed border-[color:color-mix(in_srgb,var(--accent),transparent_55%)] bg-[color:color-mix(in_srgb,var(--accent),transparent_93%)]"
            />
          ) : null}
          <main ref={assignMainScrollAndUrlDropRef} className="absolute inset-0 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === "downloader" && (
                <DownloaderView
                  key="downloader"
                  internalDir={RUFORGE_INTERNAL_DIR}
                  storageFull={storageBlocksNewDownloads}
                />
              )}
              {activeTab === "explorer" && (
                <div ref={explorerContainerRef} className="absolute inset-0 min-h-0 bg-[#1D1613] overflow-hidden">
                  {/* Shimmer Placeholder */}
                  <div className="absolute inset-0 z-0 flex flex-col p-8 space-y-8 animate-pulse">
                    <div className="h-12 w-1/3 bg-white/5 rounded-2xl" />
                    <div className="grid grid-cols-4 gap-6 flex-1">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="aspect-video bg-white/5 rounded-[24px]" />
                      ))}
                    </div>
                  </div>
                </div>
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
              {activeTab === "player" && playingFile && (
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
                    ? "bg-[#2c1818] text-stone-100 border border-red-900/35"
                    : t === "progress"
                      ? "bg-[#271C18] text-stone-50 border border-stone-50/10"
                      : t === "warning"
                        ? "bg-[#271C18] text-stone-50 border-2 border-dotted border-yellow-400/90"
                        : "bg-[#271C18] text-stone-50 border border-stone-50/10";
                const closeBtn =
                  t === "error"
                    ? "text-red-200/70 hover:text-red-100"
                    : t === "warning"
                      ? "text-yellow-200/55 hover:text-yellow-100/90"
                      : "text-stone-500 hover:text-stone-300";
                return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`${shell} px-3 py-2 rounded-xl shadow-lg flex items-center gap-2.5 pointer-events-auto min-w-0 w-full`}
                >
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
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <UpdaterFullWindowUpdate
        phase={updaterPhase}
        downloaded={updaterDownloaded}
        contentLength={updaterContentLength}
      />

      <AuthorizeCleanupModal />
    </div>
  );
}

export default App;

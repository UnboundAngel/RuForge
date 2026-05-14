import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Webview } from "@tauri-apps/api/webview";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";
import { syncRuforgeAccentCss } from "./accentCss";
import { notifyWhenUnfocused } from "./systemNotify";
import { check } from "@tauri-apps/plugin-updater";
import { Icon } from "@iconify/react";
import logo from "./assets/neotubeIcon.png";
import MiniPlayer from "./MiniPlayer";
import { isAudioOnlyPath } from "./mediaKind";
import { flattenGalleryScanToMediaFiles } from "./galleryScan";
import { DownloaderView } from "./components/DownloaderView";
import { PlayerView, type PlayerViewHandle } from "./components/PlayerView";
import { SettingsView } from "./components/SettingsView";
import { MediaView } from "./components/MediaView";
import { PlaylistDetailView } from "./components/PlaylistDetailView";
import { MediaFile } from "./types";
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
} from "lucide-react";

import { useRuforgeStore, RUFORGE_INTERNAL_DIR, type ActiveTab } from "./store/ruforgeStore";

const WindowControls = ({ onMiniPlayerToggle }: { onMiniPlayerToggle: () => void }) => {
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
      <button
        onClick={onMiniPlayerToggle}
        className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-[color:var(--accent)] transition-colors"
        title="Launch Mini Player"
      >
        <Icon icon="material-symbols:ad-group-outline" width={18} height={18} />
      </button>

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
  const onAuthorizeCleanup = useRuforgeStore((s) => s.handleAuthorizeCleanup);
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
                onClick={onAuthorizeCleanup}
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
  const notifications = useRuforgeStore((s) => s.notifications);
  const dismissNotification = useRuforgeStore((s) => s.dismissNotification);
  const notify = useRuforgeStore((s) => s.notify);
  const explorerContainerRef = useRef<HTMLDivElement>(null);
  const explorerWebviewRef = useRef<Webview | null>(null);
  const playerViewRef = useRef<PlayerViewHandle>(null);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const storageStats = useRuforgeStore((s) => s.storageStats);
  const lastExplorerUrl = useRuforgeStore((s) => s.lastExplorerUrl);
  const setLastExplorerUrl = useRuforgeStore((s) => s.setLastExplorerUrl);
  const setSidebarCollapsedByResize = useRuforgeStore((s) => s.setSidebarCollapsedByResize);

  useEffect(() => {
    invoke<boolean>("get_hardware_acceleration_pref")
      .then((hw) => {
        useRuforgeStore.getState().mergeHardwareAccelerationFromBackend(hw);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    syncRuforgeAccentCss(typeof settings.accentColor === "string" ? settings.accentColor : "#EDCF9B");
  }, [settings.accentColor]);

  useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats, outputDir, saveToInternal]);

  const addLog = useCallback((msg: string) => {
    console.log("[Explorer Debug]", msg);
  }, []);

  // Manage Embedded Explorer Webview.
  // Deps: `activeTab`, `addLog` only — not `settings.accentColor`: this effect owns the 1s poll
  // and show/position/hide webview; accent is baked in `tauri://created` only (same as before
  // adding accent to deps would re-run the whole effect on every accent change).
  useEffect(() => {
    let active = true;
    let interval: number;
    
    const syncWebview = async () => {
      if (!active) return;
      const appWindow = getCurrentWindow();
      
      if (activeTab === "explorer") {
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
              
              const accent = typeof settings.accentColor === "string" ? settings.accentColor : "#EDCF9B";
              const rgb = syncRuforgeAccentCss(accent, true); // Get RGB for rgba borders
              const borderRgba = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)` : 'rgba(237, 207, 155, 0.2)';
              const glowRgba = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : 'rgba(237, 207, 155, 0.3)';

              invoke("eval_in_webview", {
                label: 'explorer-view',
                script: `
                  (function() {
                    console.log('NeoTube Explorer Active');

                    const style = document.createElement('style');
                    style.innerHTML = '#neotube-dl-btn { position: fixed; top: 24px; right: 24px; z-index: 2147483647; background: rgba(29, 22, 19, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid ${borderRgba}; border-radius: 999px; padding: 14px 28px; display: flex; align-items: center; gap: 18px; cursor: pointer; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); box-shadow: 0 15px 45px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1); opacity: 0; transform: translateY(-20px) scale(0.9); pointer-events: none; user-select: none; font-family: system-ui, -apple-system, sans-serif; } #neotube-dl-btn.visible { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; } #neotube-dl-btn:hover { background: ${accent}; border-color: ${accent}; transform: translateY(-2px) scale(1.02); box-shadow: 0 20px 50px ${glowRgba}; } #neotube-dl-btn .text-group { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; } #neotube-dl-btn .main-text { color: ${accent}; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; transition: color 0.3s; } #neotube-dl-btn .sub-text { color: rgba(255, 255, 255, 0.4); font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; transition: color 0.3s; } #neotube-dl-btn .icon { color: ${accent}; width: 22px; height: 22px; transition: transform 0.3s, color 0.3s; } #neotube-dl-btn:hover .main-text { color: #1d1613; } #neotube-dl-btn:hover .sub-text { color: rgba(29, 22, 19, 0.6); } #neotube-dl-btn:hover .icon { color: #1d1613; transform: translateY(2px); }';
                    document.head.appendChild(style);
                    const btn = document.createElement('div');
                    btn.id = 'neotube-dl-btn';
                    btn.innerHTML = '<div class="text-group"><span class="main-text">Source Found</span><span class="sub-text">Direct Download</span></div><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
                    document.body.appendChild(btn);

                    btn.onclick = () => {
                       window.__TAURI__.event.emit('manual-download-trigger', window.location.href);
                       btn.classList.remove('visible');
                    };

                    let lastUrl = window.location.href;
                    function checkUrl(force = false) {
                      const currentUrl = window.location.href;
                      if (currentUrl !== lastUrl || force) {
                        lastUrl = currentUrl;
                        if (currentUrl.includes("watch?v=")) {
                          btn.classList.add("visible");
                        } else {
                          btn.classList.remove("visible");
                        }
                      }
                    }
                    setInterval(checkUrl, 1000);
                    window.addEventListener('yt-navigate-finish', () => checkUrl());
                    checkUrl(true);
                  })();
                `
              });
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
          } catch (e: any) {
             addLog(`Update failed: ${e?.message || String(e)}`);
          }
        }
      } else if (explorerWebviewRef.current) {
        try {
          addLog("Hiding Webview...");
          await explorerWebviewRef.current.hide();
        } catch (e: any) {
          addLog(`Hide failed: ${e?.message || String(e)}`);
          console.error("Webview hide failed", e);
        }
      }
    };

    // Run immediately and then poll to handle animations/resizes cleanly
    syncWebview();
    interval = window.setInterval(syncWebview, 1000); // Polling 1s to avoid spam

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeTab, addLog]);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const update = await check();
        if (update) {
          notify(`Version ${update.version} is available!`, "update", update);
        }
      } catch (e) {
        console.error("Update check failed", e);
      }
    };
    checkUpdate();
  }, [notify]);

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

    const unlistenManualDownload = listen<string>("manual-download-trigger", () => {
      useRuforgeStore.getState().setActiveTab("downloader");
    });

    return () => {
      unlisten.then((f) => f());
      unlistenStop.then((f) => f());
      unlistenManualDownload.then((f) => f());
    };
  }, []);

  // Send-to-main handoff from miniplayer
  useEffect(() => {
    const unlistenHandoff = listen<MediaFile>("send-to-main", async (event) => {
      const st = useRuforgeStore.getState();
      st.setPlayingFile(event.payload);
      st.setActiveTab("player");
      st.notify(`Now playing: ${event.payload.name}`);
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
        onMiniPlayerToggle={() =>
          void useRuforgeStore.getState().handlePopOut(
            useRuforgeStore.getState().activeTab === "player"
              ? playerViewRef.current?.getCurrentTime() ?? 0
              : undefined,
          )
        }
      />

      {/* Global Drag Region - Top strip except controls area */}
      <div className="fixed top-0 left-0 right-[200px] h-10 z-[50]" data-tauri-drag-region />

      {/* ── Sidebar ─────────────────────────────────────── */}
      <div className={`${isSidebarExpanded ? 'w-[240px]' : 'w-[80px]'} flex-shrink-0 relative z-20 flex flex-col bg-transparent overflow-hidden transition-[width] duration-500 ease-[0.23,1,0.32,1]`}>
        {/* Logo */}
        <div className="h-[72px] flex items-center px-5 flex-shrink-0 cursor-default" data-tauri-drag-region>
          <div className="flex items-center gap-4 pointer-events-none">
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
          {activeTab === "settings" ? (
            <motion.div
              key="settings-tabs"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute left-6 top-0 z-20 flex items-start h-[80px] pointer-events-none"
            >
              {(["general", "downloads", "appearance", "advanced"] as const).map((tab) => {
                const isActive = settingsTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    className="relative flex h-[80px] px-6 items-end pb-2 justify-center cursor-pointer pointer-events-auto"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="settingsTabShape"
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
                    <span className={`font-medium text-[11px] uppercase tracking-[0.05em] transition-colors relative z-10 ${isActive ? "text-[color:var(--accent)]" : "text-stone-400 hover:text-stone-50"}`}>
                      {tab}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : (activeTab === "media" && !selectedPlaylist) ? (
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
        {activeTab === "explorer" && (
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
        {activeTab === "media" && (
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
          <main className="absolute inset-0 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === "downloader" && (
                <DownloaderView
                  key="downloader"
                  internalDir={RUFORGE_INTERNAL_DIR}
                  storageFull={saveToInternal && (storageStats ? (storageStats.total_bytes / (1024 * 1024 * 1024)) >= settings.storageLimitGB : false)}
                  onDownloadSuccess={() => {
                    notify("Complete");
                    void notifyWhenUnfocused({
                      title: "RuForge",
                      body: "Download finished — your file is ready.",
                    });
                    void refreshStorageStats();
                    setActiveTab("media");
                  }}
                  onDownloadError={(err) => {
                    notify(`Failed: ${err.split('\n')[0]}`);
                  }}
                />
              )}
              {activeTab === "explorer" && (
                <div ref={explorerContainerRef} className="h-full w-full bg-[#1D1613] relative overflow-hidden">
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
                  t === "update"
                    ? "bg-[#EDD79C] text-[#1d1613] border border-[#1d1613]/12"
                    : t === "error"
                      ? "bg-[#2c1818] text-stone-100 border border-red-900/35"
                      : t === "progress"
                        ? "bg-[#271C18] text-stone-50 border border-stone-50/10"
                        : "bg-[#271C18] text-stone-50 border border-stone-50/10";
                const closeBtn =
                  t === "update"
                    ? "text-[#1d1613]/55 hover:text-[#1d1613]"
                    : t === "error"
                      ? "text-red-200/70 hover:text-red-100"
                      : "text-stone-500 hover:text-stone-300";
                return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`${shell} px-3 py-2 rounded-xl shadow-lg flex items-start gap-2.5 pointer-events-auto min-w-0 w-full`}
                >
                  {t === "update" ? (
                    <Download className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2.25} />
                  ) : t === "error" ? (
                    <AlertCircle className="text-red-400 w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : t === "progress" ? (
                    <Loader2 className="text-[color:var(--accent)] w-4 h-4 flex-shrink-0 mt-0.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="text-emerald-400 w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 flex flex-col min-w-0">
                    <span className={`text-xs font-semibold leading-snug ${t === "update" ? "text-[#1d1613]" : ""}`}>
                      {n.message}
                    </span>
                    {t === "update" && (
                      <button
                        type="button"
                        onClick={async () => {
                          const updateId = n.id;
                          dismissNotification(updateId);
                          const progressId = notify("Downloading update…", "progress");
                          try {
                            await n.updateObj?.downloadAndInstall();
                          } catch (e) {
                            console.error(e);
                            dismissNotification(progressId);
                            notify(
                              "Update failed. Check your connection, or install the latest build from GitHub Releases.",
                              "error",
                            );
                          }
                        }}
                        className="mt-1.5 text-[10px] font-bold uppercase tracking-wide bg-[#1d1613] text-[#EDD79C] px-2.5 py-1 rounded-md w-fit hover:bg-black/85 transition-colors"
                      >
                        Update Now
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => dismissNotification(n.id)}
                    className={`${closeBtn} transition-colors flex-shrink-0 p-0.5 rounded`}
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
    </div>
  );
}

export default App;

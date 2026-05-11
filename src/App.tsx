import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import logo from "./assets/neotubeIcon.png";
import MiniPlayer from "./MiniPlayer";
import { MediaFile } from "./types";
import { DownloaderView } from "./components/DownloaderView";
import { GalleryView } from "./components/GalleryView";
import { PlayerView } from "./components/PlayerView";
import { SettingsView } from "./components/SettingsView";
import { MediaView } from "./components/MediaView";
import {
  Download,
  PlaySquare,
  Settings,
  Monitor,
  Search,
  CheckCircle2,
  X,
  Youtube
} from "lucide-react";

type ActiveTab = "downloader" | "media" | "gallery" | "player" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("downloader");
  const [settingsTab, setSettingsTab] = useState<"general" | "downloads" | "appearance" | "advanced">("general");
  const [playingFile, setPlayingFile] = useState<MediaFile | null>(null);
  const [isMini, setIsMini] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [notifications, setNotifications] = useState<{ id: number; message: string }[]>([]);

  const [outputDir, setOutputDirState] = useState(() => {
    return localStorage.getItem("ruforge-output-dir") || "C:\\Downloads";
  });

  const setOutputDir = (dir: string) => {
    setOutputDirState(dir);
    localStorage.setItem("ruforge-output-dir", dir);
  };

  const notify = useCallback((message: string) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }, []);

  // Sync settings with backend on mount
  useEffect(() => {
    const syncSettings = async () => {
      const saved = localStorage.getItem('ruforge-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        
        // Sync tray
        await invoke('update_tray_config', { minimize: settings.minimizeToTray });
        
        // Sync autostart
        try {
          const enabled = await isEnabled();
          if (enabled !== settings.launchAtStartup) {
            if (settings.launchAtStartup) await enable();
            else await disable();
          }
        } catch (e) {
          console.error('Autostart sync failed:', e);
        }
      }
    };
    syncSettings();
  }, []);

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
      setPlayingFile(event.payload);
      emit("stop-playback");
    });

    const unlistenStop = listen("stop-playback", () => {
      setPlayingFile(null);
    });

    return () => {
      unlisten.then((f) => f());
      unlistenStop.then((f) => f());
    };
  }, [outputDir]);

  // Send-to-main handoff from miniplayer
  useEffect(() => {
    const unlistenHandoff = listen<MediaFile>("send-to-main", async (event) => {
      await getCurrentWindow().setFocus();
      setPlayingFile(event.payload);
      setActiveTab("player");
    });
    return () => {
      unlistenHandoff.then((f) => f());
    };
  }, []);

  // System notifications on play
  useEffect(() => {
    const notifyPlay = async () => {
      if (playingFile) {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === "granted";
        }
        if (permissionGranted) {
          sendNotification({ title: "RuForge Playing", body: playingFile.name });
        }
        notify(`Now Playing: ${playingFile.name}`);
        setActiveTab("player");
      }
    };
    notifyPlay();
  }, [playingFile]);

  const handlePopOut = async () => {
    try {
      await invoke("open_mini_player");
      if (playingFile) {
        setTimeout(async () => {
          emit("play-media", playingFile);
        }, 500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlayFile = (file: MediaFile) => {
    setPlayingFile(file);
    setActiveTab("player");
  };

  if (isMini) return <MiniPlayer />;

  const navItems = [
    { id: "downloader" as ActiveTab, icon: Download, label: "Grab" },
    { id: "media" as ActiveTab, icon: Youtube, label: "Media" },
    { id: "gallery" as ActiveTab, icon: PlaySquare, label: "Library" },
    { id: "settings" as ActiveTab, icon: Settings, label: "System" },
  ];

  return (
    <div className="h-screen w-screen bg-[#271C18] text-stone-50 font-sans flex overflow-hidden select-none">

      {/* ── Sidebar ─────────────────────────────────────── */}
      <div className="w-[72px] lg:w-[240px] flex-shrink-0 relative z-20 flex flex-col bg-transparent">
        {/* Logo */}
        <div className="h-[72px] flex items-center px-4 lg:px-6 gap-4 flex-shrink-0">
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 bg-amber-500 blur-xl opacity-20 rounded-2xl" />
            <img src={logo} className="w-10 h-10 rounded-xl relative z-10 shadow-xl object-cover" alt="RuForge" />
          </div>
          <span className="hidden lg:block font-black text-2xl tracking-tighter text-stone-100">RUFORGE</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl transition-all duration-200 relative group overflow-hidden ${
                  isActive
                    ? "bg-amber-500/10 text-amber-400"
                    : "text-stone-500 hover:text-stone-200 hover:bg-white/[0.04]"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="navGlow"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-amber-500 rounded-full"
                    transition={{ type: "spring", bounce: 0.25, duration: 0.4 }}
                  />
                )}
                <item.icon
                  size={18}
                  className={`flex-shrink-0 ml-1 ${isActive ? "text-amber-400" : "text-stone-600 group-hover:text-stone-300"}`}
                />
                <span className="hidden lg:block font-black text-xs uppercase tracking-[0.15em]">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mini Player launch */}
        <div className="p-3 flex-shrink-0">
          <div className="glass-elevated rounded-[28px] p-5 space-y-5 relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-amber-500/5 rounded-full blur-2xl" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-amber-950/60 flex items-center justify-center flex-shrink-0">
                <Monitor size={16} className="text-amber-500/40" />
              </div>
              <div className="hidden lg:block">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-50">Theater</p>
                <p className="text-[8px] text-amber-600 font-bold uppercase">Ready</p>
              </div>
            </div>
            <button
              onClick={handlePopOut}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 py-3.5 rounded-full text-[9px] font-black text-amber-950 transition-all shadow-xl shadow-amber-900/20 active:scale-95 uppercase tracking-widest"
            >
              <Monitor size={12} />
              <span className="hidden lg:block">Launch Mini</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Right Column ────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 pt-[24px] relative z-10">

        {/* Top chrome label */}
        <div className="absolute left-6 top-0 h-[24px] text-stone-500 text-[10px] font-bold tracking-[0.2em] uppercase flex items-center z-20 pointer-events-none">
          {activeTab !== "settings" && activeTab}
        </div>

        {/* Settings tab strip */}
        <AnimatePresence>
          {activeTab === "settings" && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute left-6 top-0 z-20 flex items-start h-[64px] pointer-events-none"
            >
              {(["general", "downloads", "appearance", "advanced"] as const).map((tab) => {
                const isActive = settingsTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    className="relative flex h-[64px] px-6 items-end pb-2 justify-center cursor-pointer pointer-events-auto"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="settingsTabShape"
                        className="absolute inset-0 bg-[#271C18] rounded-b-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-0"
                        style={{ clipPath: "inset(24px -100px -100px -100px)" }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      >
                        <div className="absolute left-[-16px] top-[24px] w-[16px] h-[16px] text-[#271C18]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
                        </div>
                        <div className="absolute right-[-16px] top-[24px] w-[16px] h-[16px] text-[#271C18]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M0 0V16C0 7.16344 7.16344 0 16 0H0Z" fill="currentColor" /></svg>
                        </div>
                      </motion.div>
                    )}
                    <span className={`font-medium text-[11px] uppercase tracking-[0.05em] transition-colors relative z-10 ${isActive ? "text-amber-500" : "text-stone-400 hover:text-stone-50"}`}>
                      {tab}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gallery search/settings tab bulge */}
        <AnimatePresence>
          {activeTab === "gallery" && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute right-6 top-0 z-20 flex h-[64px] pointer-events-none"
            >
              <div
                className="relative flex h-[64px] bg-[#271C18] rounded-b-[28px] px-6 items-end pb-1 justify-end pointer-events-auto shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                style={{ clipPath: "inset(24px -100px -100px -100px)" }}
              >
                <div className="absolute left-[-16px] top-[24px] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M16 0H0C8.83656 0 16 7.16344 16 16V0Z" fill="currentColor" /></svg>
                </div>
                <div className="absolute right-[-16px] top-[24px] w-[16px] h-[16px] text-[#271C18] pointer-events-none">
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
                          className="w-full bg-black/20 border border-stone-50/5 rounded-full px-4 py-1.5 text-xs text-stone-50 placeholder-stone-500 outline-none focus:border-amber-500/50 transition-colors"
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main Content ─────────────────────────────── */}
        <div className="flex-1 relative bg-[#1D1613] rounded-tl-[32px] overflow-hidden shadow-[inset_6px_6px_24px_rgba(0,0,0,0.5)] z-0">
          <main className="absolute inset-0 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === "downloader" && (
                <DownloaderView
                  key="downloader"
                  outputDir={outputDir}
                  onOutputDirChange={setOutputDir}
                  onDownloadSuccess={() => {
                    notify("Download complete!");
                    setActiveTab("gallery");
                  }}
                />
              )}
              {activeTab === "gallery" && (
                <GalleryView
                  key="gallery"
                  outputDir={outputDir}
                  onPlay={handlePlayFile}
                />
              )}
              {activeTab === "player" && playingFile && (
                <PlayerView
                  key="player"
                  file={playingFile}
                  onBack={() => setActiveTab("gallery")}
                  onMiniPlayerToggle={handlePopOut}
                />
              )}
              {activeTab === "settings" && (
                <SettingsView
                  key="settings"
                  activeTab={settingsTab}
                  outputDir={outputDir}
                  onOutputDirChange={setOutputDir}
                  onNotify={notify}
                />
              )}
              {activeTab === "media" && (
                <MediaView 
                  key="media" 
                  outputDir={outputDir} 
                  onPlay={handlePlayFile} 
                  onNotify={notify} 
                />
              )}
            </AnimatePresence>
          </main>

          {/* Toast Notifications */}
          <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-50 pointer-events-none">
            <AnimatePresence>
              {notifications.map((n) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-[#271C18] border border-stone-50/10 text-stone-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto"
                >
                  <CheckCircle2 className="text-emerald-400 w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium truncate max-w-[260px]">{n.message}</span>
                  <button onClick={() => setNotifications((p) => p.filter((x) => x.id !== n.id))} className="text-stone-500 hover:text-stone-300 transition-colors ml-auto">
                    <X size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

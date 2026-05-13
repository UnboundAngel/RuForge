import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { VideoInfo, ProgressPayload } from "../types";
import { ytdlpFormatFromPreferredQuality } from "../downloadFormat";
import { Globe, Clock, Download, Info, HardDrive, List } from "lucide-react";

function formatApproxFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) {
    const n = bytes / gb;
    return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    const n = bytes / mb;
    return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} MB`;
  }
  const n = bytes / kb;
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} KB`;
}

const DownloadQueueItem = ({ 
  item, 
  index, 
  currentIndex, 
  percentage 
}: { 
  item: any, 
  index: number, 
  currentIndex?: number, 
  percentage: number 
}) => {
  const isCompleted = currentIndex !== undefined && index < currentIndex;
  const isCurrent = currentIndex !== undefined && index === currentIndex;
  const isPending = currentIndex !== undefined && index > currentIndex;
  const opacityClass = isPending ? 'opacity-60' : 'opacity-100';
  const progress = isCompleted ? 100 : isCurrent ? percentage : 0;

  return (
    <div className={`flex-shrink-0 relative w-64 aspect-video rounded-3xl overflow-hidden bg-stone-900 border border-white/5 shadow-2xl transition-all duration-500 ${isCurrent ? 'scale-105 ring-2 ring-[color-mix(in_srgb,var(--accent),transparent_50%)] z-10' : `scale-100 ${opacityClass}`}`}>
        {/* Grayscale Base Layer */}
        <img 
          src={item.thumbnail} 
          alt="" 
          className="absolute inset-0 w-full h-full object-cover filter grayscale opacity-20"
        />
        {/* Full Color Animated Layer */}
        <motion.div 
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}
        >
          <img 
            src={item.thumbnail} 
            alt="" 
            className="w-full h-full object-cover shadow-[0_0_40px_var(--accent-glow)]"
          />
        </motion.div>
    </div>
  );
};

export const DownloaderView = ({ 
  outputDir, 
  internalDir,
  saveToInternal,
  settings,
  updateSetting,
  storageFull,
  onDownloadSuccess,
  onDownloadError
}: { 
  outputDir: string; 
  internalDir: string;
  saveToInternal: boolean;
  settings: any;
  updateSetting: (key: string, value: any) => void;
  storageFull: boolean;
  onDownloadSuccess: () => void;
  onDownloadError: (msg: string) => void;
}) => {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  const handleBrowserChange = async (val: string) => {
    updateSetting("browserContext", val);

    if (val === "custom") {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Text', extensions: ['txt'] }]
      });
      if (selected && typeof selected === 'string') {
        updateSetting("cookieFile", selected);
      } else {
        updateSetting("browserContext", "");
      }
    }
  };

  const startDownload = useCallback(
    async (targetUrl: string) => {
      const s = settingsRef.current;
      if (!targetUrl || (saveToInternal && storageFull)) return;
      setDownloading(true);
      try {
        await invoke("download_video", {
          url: targetUrl,
          options: {
            format: ytdlpFormatFromPreferredQuality(s.preferredQuality),
            output_dir: saveToInternal ? internalDir : outputDir,
            filename_template: "%(title)s.%(ext)s",
            browser_cookies: s.browserContext === "custom" ? "" : s.browserContext,
            cookie_file: s.browserContext === "custom" ? s.cookieFile : "",
          },
        });
        onDownloadSuccess();
      } catch (e: any) {
        console.error(e);
        onDownloadError(e.toString());
      } finally {
        setDownloading(false);
        setProgress(null);
      }
    },
    [saveToInternal, storageFull, outputDir, internalDir, onDownloadSuccess, onDownloadError],
  );

  const startDownloadRef = useRef(startDownload);
  startDownloadRef.current = startDownload;

  useEffect(() => {
    const unlistenProgress = listen<ProgressPayload>("download-progress", (event) => {
      setProgress(event.payload);
      setDownloading(true);
    });
    const unlistenManualTrigger = listen<string>("manual-download-trigger", (event) => {
      void startDownloadRef.current(event.payload);
    });
    return () => {
      unlistenProgress.then((f) => f());
      unlistenManualTrigger.then((f) => f());
    };
  }, []);

  // Fetch video info when URL changes
  useEffect(() => {
    let active = true;
    if (url.startsWith("http")) {
      const fetchInfo = async () => {
        setLoading(true);
        try {
          const info = await invoke<VideoInfo>("get_video_info", { url });
          if (active) setVideoInfo(info);
        } catch (e) {
          if (active) setVideoInfo(null);
        } finally {
          if (active) setLoading(false);
        }
      };
      
      const timeoutId = setTimeout(fetchInfo, 500);
      return () => { 
        active = false;
        clearTimeout(timeoutId);
      };
    } else {
      setVideoInfo(null);
    }
  }, [url]);

  const handleAction = () => startDownload(url);

  const browserOptions = [
    { value: "ruforge", label: "Internal" },
    { value: "firefox", label: "Firefox" },
    { value: "edge", label: "Edge" },
    { value: "safari", label: "Safari" },
    { value: "brave", label: "Brave" },
    { value: "custom", label: "Cookies" },
    { value: "", label: "None" }
  ];

  const [isFocused, setIsFocused] = useState(false);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Immersive Background */}
      <AnimatePresence>
        {videoInfo && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 z-0"
          >
            <img 
              src={videoInfo.thumbnail} 
              alt="" 
              className="w-full h-full object-cover opacity-40 blur-[12px] saturate-[1.1]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#1D1613]/80 via-transparent to-[#1D1613]" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 h-full flex flex-col p-12 lg:p-20">
        {/* Top: Browser Selector - More Discrete */}
        {!downloading && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 mb-16"
          >
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
              {browserOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleBrowserChange(opt.value)}
                  className={`flex items-center gap-2 group transition-all duration-300`}
                >
                  <div className={`w-1 h-1 rounded-full transition-all duration-300 ${settings.browserContext === opt.value ? 'bg-[color:var(--accent)] scale-150' : 'bg-stone-800 group-hover:bg-stone-600'}`} />
                  <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${
                    settings.browserContext === opt.value ? 'text-[color:var(--accent)]' : 'text-stone-700 group-hover:text-stone-500'
                  }`}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>

            <AnimatePresence>
              {!settings.browserContext && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent),transparent_90%)] bg-[color-mix(in_srgb,var(--accent),transparent_95%)]"
                >
                  <Info size={10} className="text-[color:var(--accent)] opacity-40" />
                  <span className="text-[8px] font-black text-[color:var(--accent)] opacity-30 uppercase tracking-[0.2em]">
                    Select a browser if you encounter errors (needed for restricted content)
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col justify-center w-full">
          <div className="w-full max-w-6xl mx-auto space-y-12">
            {!downloading ? (
              <div className="space-y-16">
                {/* Minimalist Input - Centered */}
                <div className="relative group max-w-2xl mx-auto pt-10">
                  <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="PASTE LINK" 
                    className="w-full bg-transparent text-center text-xl font-black tracking-[0.2em] text-stone-100 placeholder:text-stone-800 outline-none border-none transition-all uppercase"
                  />
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                    <div className={`h-[2px] rounded-full transition-all duration-700 bg-[color:var(--accent)] opacity-30 ${isFocused ? 'w-48' : 'w-0'}`} />
                    {loading && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-3 h-3 border-2 border-white/10 border-t-[color:var(--accent)] rounded-full"
                      />
                    )}
                    <div className={`h-[2px] rounded-full transition-all duration-700 bg-[color:var(--accent)] opacity-30 ${isFocused ? 'w-48' : 'w-0'}`} />
                  </div>
                </div>
                
                {/* Dynamic Massive Typography */}
                <AnimatePresence mode="wait">
                  {videoInfo && !loading ? (
                    <motion.div
                      key="video-details"
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                      className="text-center space-y-6"
                    >
                      <h2 className="text-5xl lg:text-8xl font-black text-white leading-[0.9] tracking-tighter line-clamp-3">
                        {videoInfo.title}
                      </h2>
                      
                      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] font-black uppercase tracking-[0.4em] text-[color:var(--accent)] opacity-60">
                         <div className="flex items-center gap-2">
                           <Clock size={14} className="opacity-50" />
                           <span>{formatDuration(videoInfo.duration)}</span>
                         </div>
                         {videoInfo.fileSizeBytes != null &&
                           videoInfo.fileSizeBytes > 0 && (
                           <div className="flex items-center gap-2">
                             <HardDrive size={14} className="opacity-50" />
                             <span title="Approximate size from the host / yt-dlp metadata">
                               ~{formatApproxFileSize(videoInfo.fileSizeBytes)}
                             </span>
                           </div>
                         )}
                         {videoInfo.isPlaylist && (
                           <div className="flex items-center gap-2">
                             <List size={14} className="opacity-50" />
                             <span>{videoInfo.playlistItems?.length || 0} Videos</span>
                           </div>
                         )}
                         <div className="flex items-center gap-2">
                           <Globe size={14} className="opacity-50" />
                           <span>YouTube</span>
                         </div>
                      </div>

                      <div className="pt-8">
                        <button 
                          onClick={handleAction}
                          className="px-12 py-5 rounded-full bg-[color:var(--accent)] text-stone-950 text-xs font-black uppercase tracking-[0.4em] hover:bg-white hover:scale-105 transition-all duration-300 shadow-[0_20px_50px_var(--accent-glow)] flex items-center gap-4 mx-auto"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>

                      {/* Playlist Queue Preview */}
                      {videoInfo.isPlaylist && videoInfo.playlistItems && (
                        <div className="max-w-xl mx-auto mt-12 pt-12 border-t border-white/5 h-[300px] overflow-y-auto scrollbar-none space-y-2">
                          {videoInfo.playlistItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                               <div className="w-24 aspect-video rounded-lg overflow-hidden bg-stone-900 flex-shrink-0">
                                  <img src={item.thumbnail} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                               </div>
                               <div className="flex-1 text-left min-w-0">
                                  <h4 className="text-[11px] font-black uppercase tracking-widest text-stone-400 group-hover:text-white truncate">{item.title}</h4>
                                  <span className="text-[10px] font-mono text-stone-600 mt-1 block">{formatDuration(item.duration)}</span>
                               </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* Immersive Downloading State */
              <div className="relative h-full flex flex-col justify-center items-center">
                {/* Top Right: Status Stats */}
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute top-0 right-0 text-right space-y-6"
                >
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-stone-600 uppercase tracking-[0.4em] mb-2">Progress</span>
                    <p className="text-3xl font-black text-white font-mono tracking-tighter leading-none">
                      {progress?.percentage.toFixed(0) || 0}
                      <span className="text-[color:var(--accent)] opacity-40 ml-0.5">%</span>
                    </p>
                  </div>
                  {progress?.currentIndex !== undefined && progress?.totalItems !== undefined && (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-stone-600 uppercase tracking-[0.4em] mb-2">Item</span>
                      <p className="text-xl font-black text-[color:var(--accent)] font-mono tracking-tighter leading-none">
                        {progress.currentIndex + 1} / {progress.totalItems}
                      </p>
                    </div>
                  )}
                </motion.div>

                {/* Center: Main Content */}
                <div className="w-full flex flex-col items-center">
                  <div className="w-full max-w-4xl space-y-16 mb-20">
                    <div className="space-y-8">
                      <motion.h3 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl lg:text-7xl font-black text-white uppercase tracking-tighter line-clamp-2 text-center leading-[0.9] drop-shadow-2xl"
                      >
                        {progress?.currentItemTitle || videoInfo?.title}
                      </motion.h3>
                      
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[11px] font-black text-[color:var(--accent)] uppercase tracking-[1em] text-center ml-[1em] opacity-60"
                      >
                        {videoInfo?.isPlaylist ? "Downloading Collection" : "Downloading Media"}
                      </motion.p>
                    </div>

                    <div className="flex gap-2 w-full max-w-2xl mx-auto h-1 px-12">
                      {[...Array(40)].map((_, i) => (
                        <div key={i} className="flex-1 bg-white/[0.04] rounded-full overflow-hidden relative">
                          <motion.div 
                            className="absolute inset-0 bg-[color:var(--accent)] shadow-[0_0_10px_var(--accent-glow)]"
                            initial={false}
                            animate={{ 
                              opacity: (progress?.percentage || 0) >= (i / 40 * 100) ? 1 : 0,
                              scaleY: (progress?.percentage || 0) >= (i / 40 * 100) ? 1 : 0.4
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Downloading Queue with Horizontal Color-Fill Animation */}
                  {videoInfo?.isPlaylist && videoInfo.playlistItems && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-screen max-w-7xl flex gap-8 overflow-x-auto scrollbar-none px-20 py-10"
                    >
                      {videoInfo.playlistItems.map((item, i) => (
                        <DownloadQueueItem 
                          key={item.id}
                          item={item}
                          index={i}
                          currentIndex={progress?.currentIndex}
                          percentage={progress?.percentage || 0}
                        />
                      ))}
                    </motion.div>
                  )}
                </div>
                
                {/* Bottom Right: Stats */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -bottom-10 -right-10 flex items-center gap-10 text-right"
                >
                  {progress?.speed && progress.speed !== "0 MB/S" && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-stone-600 uppercase tracking-[0.3em]">Speed</p>
                      <p className="text-xl font-black text-[color:var(--accent)] opacity-90 tabular-nums tracking-tighter">
                        {progress.speed}
                      </p>
                    </div>
                  )}
                  {progress?.eta && progress.eta !== "???" && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-stone-600 uppercase tracking-[0.3em]">Time</p>
                      <p className="text-xl font-black text-white tabular-nums tracking-tighter">
                        {progress.eta}
                      </p>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

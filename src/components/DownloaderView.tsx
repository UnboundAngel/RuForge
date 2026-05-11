import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Youtube, Monitor, FolderOpen, Loader2 } from "lucide-react";
import { VideoInfo, ProgressPayload } from "../types";
import { CustomDropdown } from "./CustomDropdown";

export const DownloaderView = ({ outputDir, onOutputDirChange, onDownloadSuccess }: { outputDir: string; onOutputDirChange: (dir: string) => void; onDownloadSuccess: () => void }) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [cookieFile, setCookieFile] = useState<string>(() => {
    return localStorage.getItem("neotube-cookie-file") || "";
  });
  
  const [selectedBrowser, setSelectedBrowser] = useState<string>(() => {
    return localStorage.getItem("neotube-browser") || "chrome";
  });

  const handleBrowserChange = async (val: string) => {
    setSelectedBrowser(val);
    localStorage.setItem("neotube-browser", val);
    
    if (val === "custom") {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Text',
          extensions: ['txt']
        }]
      });
      if (selected && typeof selected === 'string') {
        setCookieFile(selected);
        localStorage.setItem("neotube-cookie-file", selected);
      } else {
        setSelectedBrowser("");
        localStorage.setItem("neotube-browser", "");
      }
    }
  };

  useEffect(() => {
    const unlistenProgress = listen<ProgressPayload>("download-progress", (event) => {
      setProgress(event.payload);
    });

    const unlistenUrl = listen<string>("explorer-url", (event) => {
      setUrl(event.payload);
    });

    return () => { 
      unlistenProgress.then(f => f()); 
      unlistenUrl.then(f => f());
    };
  }, []);

  const handleAction = async () => {
    if (!url) return;
    setLoading(true);
    setVideoInfo(null);
    try {
      const info = await invoke<VideoInfo>("get_video_info", { url });
      setVideoInfo(info);
      
      setDownloading(true);
      await invoke("download_video", { 
        url, 
        options: { 
          format: "b", 
          output_dir: outputDir, 
          filename_template: "%(title)s.%(ext)s",
          browser_cookies: selectedBrowser === "custom" ? "" : selectedBrowser,
          cookie_file: selectedBrowser === "custom" ? cookieFile : ""
        } 
      });
      onDownloadSuccess();
    } catch (e) {
      console.error("Detailed Download Failure:", e);
      setLoading(false);
      setDownloading(false);
      setProgress(null);
    } finally {
      setLoading(false);
      setDownloading(false);
      setProgress(null);
    }
  };

  const pickDir = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && !Array.isArray(selected)) {
      onOutputDirChange(selected);
    }
  };

  const handleOpenExplorer = async () => {
    try {
      await invoke("open_youtube_explorer");
    } catch (e) {
      console.error(e);
    }
  };

  const browserOptions = [
    { value: "chrome", label: "Google Chrome" },
    { value: "firefox", label: "Firefox" },
    { value: "edge", label: "Microsoft Edge" },
    { value: "safari", label: "Safari" },
    { value: "brave", label: "Brave" },
    { value: "custom", label: "Custom cookies.txt" },
    { value: "", label: "No Cookies" }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="p-10 max-w-4xl mx-auto space-y-10"
    >
      <header className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-amber-50">Grab Content</h1>
          <p className="text-stone-400 font-medium">Paste any link to save it to your library.</p>
        </div>
        <button 
          onClick={handleOpenExplorer}
          className="flex items-center space-x-3 px-8 py-4 glass hover:bg-amber-500/10 rounded-full transition-all group relative"
          title="Opens an embedded browser to find links."
        >
          <Youtube className="text-amber-500 group-hover:scale-110 transition-transform" size={24} />
          <span className="text-xs font-black uppercase tracking-widest text-amber-200/50 group-hover:text-amber-200">Explore YouTube</span>
        </button>
      </header>
      
      <div className="relative">
        <div className="absolute inset-0 overflow-hidden rounded-[48px] pointer-events-none">
          <div className="absolute -bottom-10 -right-10 p-8 opacity-[0.03]">
            <Youtube size={240} />
          </div>
        </div>

        <div className="py-12 space-y-12 relative z-10">
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/50 px-6">Source URL</label>
              <div className="relative group">
                <Youtube className="absolute left-6 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-amber-400 transition-colors" size={22} />
                <input 
                  type="text" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://youtube.com/..." 
                  className="w-full bg-black/40 rounded-full py-6 pl-16 pr-8 focus:outline-none focus:bg-black/60 transition-all text-amber-50 placeholder:text-stone-600 text-sm"
                />
              </div>
            </div>

            <div className="space-y-4 relative z-20">
              <div className="flex justify-between items-center px-6">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/50">Cookie Browser</label>
              </div>
              <div className="relative group">
                <Monitor className="absolute left-6 top-1/2 -translate-y-1/2 text-stone-500 z-10 pointer-events-none" size={20} />
                <CustomDropdown 
                  value={selectedBrowser}
                  onChange={handleBrowserChange}
                  options={browserOptions}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/50 px-6">Destination</label>
            <div className="flex space-x-4">
              <div className="flex-1 relative group">
                <FolderOpen className="absolute left-6 top-1/2 -translate-y-1/2 text-stone-500" size={20} />
                <input 
                  type="text" 
                  readOnly
                  value={outputDir}
                  className="w-full bg-black/20 rounded-full py-5 pl-16 pr-8 text-xs text-stone-500 cursor-default"
                />
              </div>
              <button 
                onClick={pickDir}
                className="px-10 glass hover:bg-white/5 rounded-full font-bold transition-all text-xs uppercase tracking-widest text-stone-300"
              >
                Change
              </button>
            </div>
          </div>

          {!downloading ? (
            <button 
              onClick={handleAction}
              disabled={loading || !url}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-30 py-6 rounded-full font-black text-amber-950 transition-all flex items-center justify-center space-x-3 shadow-2xl shadow-amber-900/20 active:scale-[0.98] mt-4"
            >
              {loading ? <Loader2 className="animate-spin" size={24} /> : <Download size={24} />}
              <span className="tracking-widest uppercase">{loading ? "Fetching..." : "Download Video"}</span>
            </button>
          ) : (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 py-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Loader2 className="animate-spin text-amber-500" size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-amber-50 truncate max-w-[300px]">{videoInfo?.title || "Preparing..."}</p>
                    <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">{progress?.status || "Starting"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-amber-400 font-mono">{progress?.percentage.toFixed(0)}%</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    className="h-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress?.percentage || 0}%` }}
                    transition={{ type: "spring", damping: 25, stiffness: 120 }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-stone-500 font-black uppercase tracking-widest">
                  <span className="flex items-center space-x-1">
                    <Monitor size={10} />
                    <span>{progress?.speed || "0 MiB/s"}</span>
                  </span>
                  <span>{progress?.eta || "Unknown"} remaining</span>
                </div>
              </div>
            </motion.div>
          )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

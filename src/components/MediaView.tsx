import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, MoreVertical, Search, Loader2 } from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getAllWindows } from "@tauri-apps/api/window";
import { MediaFile } from "../types";

export const MediaView = ({ outputDir, onPlay, onNotify }: { outputDir: string, onPlay: (file: MediaFile) => void, onNotify: (msg: string) => void }) => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadFiles = async () => {
    setLoading(true);
    try {
      const data = await invoke<MediaFile[]>("scan_gallery", { dir: outputDir });
      setFiles(data);
    } catch (e) {
      console.error(e);
      onNotify("Failed to load media files.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [outputDir]);

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="h-full flex flex-col"
    >
      {/* Search Header */}
      <div className="px-10 pt-10 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-amber-50">Media Explorer</h1>
          <p className="text-stone-400 font-medium text-sm mt-1">Browse and play your downloaded content.</p>
        </div>
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-amber-500 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search media..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1D1613] rounded-full py-4 pl-14 pr-6 focus:outline-none focus:bg-[#2A1E1A] transition-all text-amber-50 placeholder:text-stone-600 text-sm border border-white/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
          />
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 overflow-y-auto px-10 pb-32">
        {loading ? (
          <div className="flex justify-center py-40">
            <Loader2 className="animate-spin text-amber-600/20" size={60} />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="py-40 text-center text-stone-500 font-black tracking-widest text-sm uppercase">
            No media found.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-10">
            {filteredFiles.map((file, i) => (
              <motion.div 
                key={file.path}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.5) }}
                className="group cursor-pointer flex flex-col gap-4"
                onClick={async () => {
                  const windows = await getAllWindows();
                  const miniOpen = windows.some(w => w.label === "mini");
                  if (miniOpen) {
                    emit("play-media", file);
                  } else {
                    onPlay(file);
                  }
                }}
              >
                {/* Thumbnail Area */}
                <div className="relative aspect-video rounded-3xl overflow-hidden bg-[#1D1613] shadow-lg group-hover:shadow-amber-500/10 transition-all duration-500 border border-white/5">
                  <video 
                    src={`${convertFileSrc(file.path)}#t=0.1`} 
                    preload="metadata" 
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-50" />
                  
                  {/* Duration Badge / Size Badge */}
                  <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] font-black tracking-wider text-amber-500/80 border border-white/10">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </div>

                  {/* Hover Play Button overlay */}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-amber-500/90 text-[#1D1613] flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.4)] backdrop-blur-sm scale-75 group-hover:scale-100 transition-all duration-300">
                      <Play size={24} fill="currentColor" className="ml-1" />
                    </div>
                  </div>
                </div>

                {/* Video Info Area */}
                <div className="flex gap-4 pr-4">
                  {/* Channel Avatar (Placeholder for local files) */}
                  <div className="w-10 h-10 rounded-full bg-[#1D1613] text-amber-500/30 flex items-center justify-center flex-shrink-0 border border-white/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                    <Play size={16} />
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1 pt-0.5">
                    <h3 className="text-sm font-bold text-stone-100 leading-tight line-clamp-2 group-hover:text-amber-400 transition-colors">
                      {file.name}
                    </h3>
                    
                    <div className="flex flex-col text-xs text-stone-500 font-medium mt-1">
                      <span className="truncate">Local Storage</span>
                      <div className="flex items-center gap-1.5 text-[11px] mt-0.5 text-stone-600">
                        <span>{new Date(file.created * 1000).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* More Options Button */}
                  <button 
                    onClick={(e) => e.stopPropagation()} 
                    className="flex-shrink-0 text-stone-600 opacity-0 group-hover:opacity-100 hover:text-stone-300 transition-all self-start pt-1"
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

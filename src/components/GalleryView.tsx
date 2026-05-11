import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getAllWindows } from "@tauri-apps/api/window";
import { PlaySquare, History, Loader2, Play, HardDrive, Clock } from "lucide-react";
import { MediaFile } from "../types";

export const GalleryView = ({ outputDir, onPlay }: { outputDir: string, onPlay: (file: MediaFile) => void }) => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const data = await invoke<MediaFile[]>("scan_gallery", { dir: outputDir });
      setFiles(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [outputDir]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="p-10 space-y-10"
    >
      <div className="flex items-center justify-between">
        <header className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-amber-50">Library</h1>
          <p className="text-stone-400 font-medium">Your collection of offline media.</p>
        </header>
        <button 
          onClick={loadFiles}
          className="p-4 glass hover:bg-white/5 rounded-2xl transition-all text-amber-200/50 hover:text-amber-400 border border-white/5 active:scale-95"
        >
          <History size={20} />
        </button>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-40">
          <Loader2 className="animate-spin text-amber-600/20" size={60} />
        </div>
      ) : files.length === 0 ? (
        <div className="glass aspect-video rounded-[48px] flex flex-col items-center justify-center text-stone-600 space-y-8 border-dashed border-2 border-white/5">
          <PlaySquare size={64} className="opacity-10" />
          <p className="font-black uppercase tracking-[0.4em] text-[10px]">Nothing here yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {files.map((file) => (
            <motion.div 
              key={file.path}
              whileHover={{ y: -8, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="glass rounded-[40px] overflow-hidden group cursor-pointer transition-all shadow-2xl hover:shadow-amber-900/10"
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
              <div className="aspect-video bg-black/60 relative flex items-center justify-center overflow-hidden">
                <video src={`${convertFileSrc(file.path)}#t=0.1`} preload="metadata" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-16 h-16 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all duration-500">
                      <Play size={24} fill="currentColor" />
                   </div>
                </div>
              </div>
              <div className="p-8 space-y-5 bg-stone-900/10 relative z-10">
                <h3 className="font-black truncate text-amber-50 leading-tight text-sm tracking-tight">{file.name}</h3>
                <div className="flex items-center justify-between text-[10px] text-stone-500 font-black uppercase tracking-[0.2em]">
                  <div className="flex items-center space-x-2">
                    <HardDrive size={12} className="text-amber-500/30" />
                    <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock size={12} className="text-amber-500/30" />
                    <span>{new Date(file.created * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

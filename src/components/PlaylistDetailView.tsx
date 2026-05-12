import { motion } from "motion/react";
import { Play, Shuffle, ArrowLeft, Clock, HardDrive, Layers, MoreVertical } from "lucide-react";
import { PlaylistCollection, MediaFile } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";

export const PlaylistDetailView = ({ 
  playlist, 
  onBack, 
  onPlay 
}: { 
  playlist: PlaylistCollection, 
  onBack: () => void, 
  onPlay: (file: MediaFile) => void 
}) => {
  const mainThumbnail = playlist.stackThumbnailPath || (playlist.items[0]?.thumbnailPath || playlist.items[0]?.ruforgePosterPath);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col md:flex-row overflow-hidden bg-[#1D1613]"
    >
      {/* Left Column: Playlist Info (Sticky) */}
      <div className="w-full md:w-[400px] lg:w-[480px] p-10 flex flex-col gap-8 flex-shrink-0 bg-gradient-to-b from-white/[0.03] to-transparent border-r border-white/5 overflow-y-auto scrollbar-none">
        <button 
          onClick={onBack}
          className="flex items-center gap-3 text-stone-500 hover:text-amber-500 transition-colors group self-start"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[11px] font-black uppercase tracking-[0.2em]">Back to Library</span>
        </button>

        <div className="relative aspect-video rounded-[32px] overflow-hidden shadow-2xl border border-white/10 group">
          {mainThumbnail ? (
            <img src={convertFileSrc(mainThumbnail)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-stone-900">
              <Layers size={48} className="text-stone-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 backdrop-blur-sm">
             <button 
              onClick={() => onPlay(playlist.items[0])}
              className="w-16 h-16 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center shadow-2xl scale-90 hover:scale-100 transition-all"
             >
                <Play size={28} fill="currentColor" />
             </button>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight">
            {playlist.title}
          </h1>
          
          <div className="flex flex-wrap gap-4">
            <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 flex items-center gap-2">
              <Layers size={12} className="text-amber-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-300">{playlist.itemCount} Videos</span>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 flex items-center gap-2">
              <Clock size={12} className="text-amber-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-300">{formatDuration(playlist.combinedDuration)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <button 
            onClick={() => onPlay(playlist.items[0])}
            className="flex items-center justify-center gap-3 py-4 rounded-2xl bg-amber-500 text-amber-950 hover:bg-white transition-all active:scale-95 shadow-xl"
          >
            <Play size={16} fill="currentColor" />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Play All</span>
          </button>
          <button 
            className="flex items-center justify-center gap-3 py-4 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all active:scale-95"
          >
            <Shuffle size={16} />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Shuffle</span>
          </button>
        </div>
      </div>

      {/* Right Column: Video List */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-none">
        <div className="space-y-4">
          {playlist.items.map((item, index) => (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onPlay(item)}
              className="group flex items-center gap-6 p-4 rounded-3xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5"
            >
              <div className="text-stone-600 font-mono text-[10px] w-4 text-center group-hover:text-amber-500 transition-colors">
                {index + 1}
              </div>
              
              <div className="relative w-40 aspect-video rounded-xl overflow-hidden bg-stone-900 flex-shrink-0 shadow-lg border border-white/5">
                {(item.thumbnailPath || item.ruforgePosterPath) ? (
                  <img
                    src={convertFileSrc(item.thumbnailPath || item.ruforgePosterPath!)} 
                    alt="" 
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play size={20} className="text-stone-800" />
                  </div>
                )}
                <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/80 rounded text-[9px] font-bold text-white tracking-widest">
                  {formatDuration(item.duration)}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-stone-100 group-hover:text-amber-400 transition-colors truncate">
                  {item.name.replace(/\.[^/.]+$/, "")}
                </h3>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-stone-500 font-semibold uppercase tracking-widest">
                    <HardDrive size={10} className="opacity-50" />
                    <span>{(item.size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                </div>
              </div>

              <button className="p-2 text-stone-600 opacity-0 group-hover:opacity-100 hover:text-white transition-all">
                <MoreVertical size={18} />
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

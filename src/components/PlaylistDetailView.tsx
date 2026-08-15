import { motion } from "motion/react";
import { Play, Shuffle, ArrowLeft, Clock, HardDrive, Layers, MoreVertical } from "lucide-react";
import { PlaylistCollection } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getPlaybackThumbnailBar } from "../playbackStorage";
import { formatDuration } from "./downloader/downloaderFormat";
import { formatStorageSize } from "../formatStorageSize";
import { useRuforgeStore } from "../store/ruforgeStore";
import { musicQueueSource } from "./music/musicQueueSource";

export const PlaylistDetailView = ({ 
  playlist, 
  onBack, 
}: { 
  playlist: PlaylistCollection, 
  onBack: () => void, 
}) => {
  const handlePlayFile = useRuforgeStore((s) => s.handlePlayFile);
  const handlePlayPlaylist = useRuforgeStore((s) => s.handlePlayPlaylist);
  const playlistSource = musicQueueSource("playlist", playlist.title);
  const mainThumbnail = playlist.stackThumbnailPath || (playlist.items[0]?.thumbnailPath || playlist.items[0]?.ruforgePosterPath);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col md:flex-row overflow-hidden relative"
    >
      {/* Shadow overlay to ensure consistent inner shadow from App.tsx layout */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_6px_6px_24px_rgba(0,0,0,0.5)] z-20 rounded-tl-[32px]" />

      {/* Left Column: Detached Playlist Info Card */}
      <div className="relative w-full md:w-[460px] lg:w-[520px] flex flex-col flex-shrink-0 px-6 pt-6 z-10 bg-[#1D1613]">
        <div 
          className="relative flex-1 w-full rounded-t-[32px] flex flex-col bg-white/[0.03] border-x border-t border-white/5"
          style={{ 
            maskImage: 'linear-gradient(to bottom, black 0%, black 60%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.4) 88%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.4) 88%, transparent 100%)'
          }}
        >
          {/* Fading Background Backdrop */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-transparent pointer-events-none" />
          
          <div className="relative h-full p-8 pb-32 flex flex-col gap-8 overflow-y-auto z-10 rf-scrollbar">
            <button 
              onClick={onBack}
              className="flex items-center gap-3 text-stone-500 hover:text-[color:var(--accent)] transition-colors group self-start"
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Back to Library</span>
            </button>

            <div className="space-y-8">
              <div 
                className="relative aspect-video rounded-3xl overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-white/10 group cursor-pointer"
                onClick={() => handlePlayPlaylist(playlist.items, false, playlistSource)}
              >
                {mainThumbnail ? (
                  <img src={convertFileSrc(mainThumbnail)} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-stone-900">
                    <Layers size={48} className="text-stone-700" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

                {/* Play All Hover Label */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2.5 px-6 py-2.5">
                    <Play size={14} fill="white" className="text-white" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-white drop-shadow-lg">Play All</span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h1 className="text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight">
                  {playlist.title}
                </h1>

                <div className="flex flex-wrap gap-2.5">
                  <div className="px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/5 flex items-center gap-2">
                    <Layers size={12} className="text-[color:var(--accent)]" />
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-stone-300">{playlist.itemCount} Videos</span>
                  </div>
                  <div className="px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/5 flex items-center gap-2">
                    <Clock size={12} className="text-[color:var(--accent)]" />
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-stone-300">{formatDuration(playlist.combinedDuration)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => handlePlayPlaylist(playlist.items, false, playlistSource)}
                  className="flex-1 flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-[color:var(--accent)] text-stone-950 hover:brightness-110 transition-all active:scale-95 shadow-xl shadow-[color:var(--accent)]/10"
                >
                  <Play size={14} fill="currentColor" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Play All</span>
                </button>
                <button 
                  onClick={() => handlePlayPlaylist(playlist.items, true, playlistSource)}
                  className="flex-1 flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all active:scale-95"
                >
                  <Shuffle size={14} />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Shuffle</span>
                </button>
              </div>            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Video List */}
      <motion.div className="flex-1 overflow-y-auto p-10 bg-[#1D1613] rf-scrollbar">
        <div className="max-w-4xl mx-auto space-y-2 relative z-10">
          {playlist.items.map((item, index) => (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => void handlePlayFile(item, playlist.items, playlistSource)}
              className="group flex items-center gap-6 p-4 rounded-3xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5"
            >
              <div className="text-stone-700 font-mono text-[10px] w-6 text-center group-hover:text-[color:var(--accent)] transition-colors">
                {index + 1}
              </div>
              
              <div className="relative w-44 aspect-video rounded-2xl overflow-hidden bg-stone-900 flex-shrink-0 shadow-lg border border-white/5">
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
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded-md text-[9px] font-bold text-white tracking-widest">
                  {formatDuration(item.duration)}
                </div>

                {(() => {
                  const bar = getPlaybackThumbnailBar(item.path, item.duration);
                  if (!bar.show) return null;
                  return (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10 overflow-hidden">
                      <div
                        className={`h-full bg-[color:var(--accent)] shadow-[0_0_8px_var(--accent)] ${bar.completed ? "opacity-90" : ""}`}
                        style={{ width: `${bar.widthPct}%` }}
                      />
                    </div>
                  );
                })()}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-bold text-stone-100 group-hover:text-[color:var(--accent)] transition-colors truncate">
                  {item.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "")}
                </h3>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-stone-500 font-black uppercase tracking-[0.15em]">
                    <HardDrive size={10} className="opacity-40" />
                    <span>{formatStorageSize(item.size)}</span>
                  </div>
                </div>
              </div>

              <button className="p-2.5 text-stone-700 opacity-0 group-hover:opacity-100 hover:text-white transition-all">
                <MoreVertical size={20} />
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { PlaySquare, History, Loader2, Play, HardDrive, Clock, Video, Volume2, VolumeX, Layers } from "lucide-react";
import { MediaFile, GalleryEntry, PlaylistCollection } from "../types";
import { ensurePostersForFiles, filesMissingPoster } from "../posterBackfill";
import { getPlaybackThumbnailBar } from "../playbackStorage";

const PlaylistStackCard = ({ playlist, onClick }: { playlist: PlaylistCollection, onClick: () => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  const mainThumbnail = playlist.stackThumbnailPath || (playlist.items[0]?.thumbnailPath || playlist.items[0]?.ruforgePosterPath);

  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      className="relative aspect-video group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <motion.div 
        animate={{ rotate: isHovered ? -4 : -2, y: isHovered ? -12 : -4, x: isHovered ? -8 : -2 }}
        className="absolute inset-0 bg-stone-800 rounded-[40px] border border-white/5 shadow-xl opacity-40"
      />
      <motion.div 
        animate={{ rotate: isHovered ? 4 : 2, y: isHovered ? -8 : -2, x: isHovered ? 8 : 2 }}
        className="absolute inset-0 bg-stone-800 rounded-[40px] border border-white/5 shadow-xl opacity-60"
      />
      <div className="absolute inset-0 glass rounded-[40px] overflow-hidden shadow-2xl transition-all border border-white/10 z-10">
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center overflow-hidden">
          {mainThumbnail ? (
            <img src={convertFileSrc(mainThumbnail)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-700" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1512]">
              <Layers className="w-14 h-14 text-stone-700" strokeWidth={1.25} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
          <div className="absolute top-4 left-4 px-3 py-1.5 bg-[color:var(--accent)] rounded-full flex items-center gap-2 shadow-2xl z-20">
            <Layers size={12} className="text-[#1d1613]" />
            <span className="text-[10px] font-black text-[#1d1613] uppercase tracking-widest">{playlist.itemCount} Videos</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all duration-500">
                <Play size={24} fill="currentColor" />
             </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-8 space-y-2 bg-gradient-to-t from-black to-transparent z-10">
          <h3 className="font-black truncate text-stone-50 leading-tight text-base tracking-tight">{playlist.title}</h3>
        </div>
      </div>
    </motion.div>
  );
};
export const GalleryView = ({ outputDir, onPlay }: { outputDir: string, onPlay: (file: MediaFile) => void }) => {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(true);
  const posterBackfillEpochRef = useRef(0);

  const loadFiles = async () => {
    const posterEpoch = ++posterBackfillEpochRef.current;
    setLoading(true);
    try {
      const data = await invoke<GalleryEntry[]>("scan_gallery", { dir: outputDir });
      if (posterBackfillEpochRef.current !== posterEpoch) return;
      setEntries(data);
      
      const mediaFiles = data.flatMap(e => e.kind === 'media' ? [e as MediaFile] : (e as PlaylistCollection).items);
      if (filesMissingPoster(mediaFiles).length > 0) {
        void (async () => {
          await ensurePostersForFiles(mediaFiles);
          if (posterBackfillEpochRef.current !== posterEpoch) return;
          try {
            const refreshed = await invoke<GalleryEntry[]>("scan_gallery", { dir: outputDir });
            if (posterBackfillEpochRef.current !== posterEpoch) return;
            setEntries(refreshed);
          } catch (e) { console.error(e); }
        })();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [outputDir]);

  const groupEntriesByDate = (entries: GalleryEntry[]) => {
    const sorted = [...entries].sort((a, b) => {
      const timeA = a.kind === 'media' ? a.created : (a.items[0]?.created || 0);
      const timeB = b.kind === 'media' ? b.created : (b.items[0]?.created || 0);
      return timeB - timeA;
    });

    const groups: { [key: string]: GalleryEntry[] } = {};

    sorted.forEach(entry => {
      const created = entry.kind === 'media' ? entry.created : (entry.items[0]?.created || 0);
      const date = new Date(created * 1000);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      let dateLabel = "";
      if (date.toDateString() === today.toDateString()) {
        dateLabel = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateLabel = "Yesterday";
      } else {
        dateLabel = date.toLocaleDateString(undefined, { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric',
          year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
      }

      if (!groups[dateLabel]) groups[dateLabel] = [];
      groups[dateLabel].push(entry);
    });

    return groups;
  };

  const groupedEntries = groupEntriesByDate(entries);

  const formatDuration = (seconds: number) => {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="p-10 space-y-16"
    >
      <div className="flex items-center justify-between">
        <header className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-stone-50">Library</h1>
          <p className="text-stone-400 font-medium">Your collection of offline media.</p>
        </header>
        <button 
          onClick={loadFiles}
          className="p-4 glass hover:bg-white/5 rounded-2xl transition-all text-[color:var(--accent)] opacity-50 hover:opacity-100 border border-white/5 active:scale-95"
        >
          <History size={20} />
        </button>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-40">
          <Loader2 className="animate-spin text-[color:var(--accent)] opacity-20" size={60} />
        </div>
      ) : entries.length === 0 ? (
        <div className="glass aspect-video rounded-[48px] flex flex-col items-center justify-center text-stone-600 space-y-8 border-dashed border-2 border-white/5">
          <PlaySquare size={64} className="opacity-10" />
          <p className="font-black uppercase tracking-[0.4em] text-[10px]">Nothing here yet</p>
        </div>
      ) : (
        <div className="space-y-20">
          {Object.entries(groupedEntries).map(([dateLabel, groupEntries]) => (
            <section key={dateLabel} className="space-y-8">
              <div className="flex items-center space-x-6">
                <h2 className="text-xl font-black text-[color:var(--accent)] opacity-80 tracking-widest uppercase flex items-center space-x-3">
                  <span className="w-8 h-[2px] bg-[color:var(--accent)] opacity-20 rounded-full" />
                  <span>{dateLabel}</span>
                </h2>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-white/5 to-transparent" />
                <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{groupEntries.length} {groupEntries.length === 1 ? 'video' : 'videos'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {groupEntries.map((entry) => {
                  if (entry.kind === 'playlist') {
                    // For now, clicking a playlist does nothing. Detailed view to be implemented.
                    return <PlaylistStackCard key={entry.path} playlist={entry} onClick={() => {}} />;
                  }
                  
                  const file = entry as MediaFile;
                  return (
                    <motion.div 
                      key={file.path}
                    whileHover={{ y: -8, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="glass rounded-[40px] overflow-hidden group cursor-pointer transition-all shadow-2xl hover:shadow-black/10"
                    onMouseEnter={() => setHoveredFile(file.path)}
                    onMouseLeave={() => setHoveredFile(null)}
                    onClick={async () => {
                      onPlay(file);
                    }}
                  >
                    <div className="aspect-video bg-black/60 relative flex items-center justify-center overflow-hidden">
                      {hoveredFile === file.path ? (
                        <>
                          <video 
                            src={`${convertFileSrc(file.path)}#t=0.1`} 
                            preload="metadata" 
                            autoPlay 
                            muted={previewMuted} 
                            loop 
                            className="absolute inset-0 w-full h-full object-cover opacity-60" 
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewMuted(!previewMuted);
                            }}
                            className="absolute top-4 right-4 p-2 glass hover:bg-white/10 rounded-full text-white z-30 transition-all active:scale-90 group-hover:opacity-100 opacity-0"
                          >
                            {previewMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                          </button>
                        </>
                      ) : (
                        (() => {
                          const stillPoster = file.thumbnailPath ?? file.ruforgePosterPath;
                          return stillPoster ? (
                            <img 
                              src={convertFileSrc(stillPoster)} 
                              alt="" 
                              className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-700" 
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1512]">
                              <Video className="w-14 h-14 text-stone-700" strokeWidth={1.25} aria-hidden />
                            </div>
                          );
                        })()
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                      
                      {file.duration > 0 && (
                        <div className="absolute bottom-4 right-4 px-2 py-1 bg-black/80 rounded-lg text-[10px] font-black text-white tracking-widest z-20">
                          {formatDuration(file.duration)}
                        </div>
                      )}

                      {(() => {
                        const bar = getPlaybackThumbnailBar(file.path, file.duration);
                        if (!bar.show) return null;
                        return (
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 z-30 overflow-hidden">
                            <div
                              className={`h-full bg-[color:var(--accent)] shadow-[0_0_12px_var(--accent)] ${bar.completed ? "opacity-90" : ""}`}
                              style={{ width: `${bar.widthPct}%` }}
                            />
                          </div>
                        );
                      })()}

                      <div className="absolute inset-0 flex items-center justify-center">
                         <div className="w-16 h-16 rounded-full bg-[color:var(--accent)] text-[#1d1613] flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all duration-500">
                            <Play size={24} fill="currentColor" />
                         </div>
                      </div>
                    </div>
                    <div className="p-8 space-y-5 bg-stone-900/10 relative z-10">
                      <h3 className="font-black truncate text-stone-50 leading-tight text-sm tracking-tight">
                        {file.name.replace(/\.[^/.]+$/, "")}
                      </h3>
                      <div className="flex items-center justify-between text-[10px] text-stone-500 font-black uppercase tracking-[0.2em]">
                        <div className="flex items-center space-x-2">
                          <HardDrive size={12} className="text-[color:var(--accent)] opacity-30" />
                          <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock size={12} className="text-[color:var(--accent)] opacity-30" />
                          <span>{new Date(file.created * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </motion.div>
  );
};

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MoreVertical, Loader2, Trash2, Image as ImageIcon, Video, Volume2, VolumeX, Layers, Play } from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { MediaFile, GalleryEntry, PlaylistCollection } from "../types";
import { getPlaybackThumbnailBar, getWatchProgress, isVideoWatched } from "../playbackStorage";
import { useRuforgeStore } from "../store/ruforgeStore";

const PlaylistStackCard = ({ playlist, onClick }: { playlist: PlaylistCollection, onClick: () => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  const mainThumbnail =
    playlist.stackThumbnailPath ||
    (playlist.items[0]?.thumbnailPath || playlist.items[0]?.ruforgePosterPath);

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
        className="absolute inset-0 bg-stone-800 rounded-2xl border border-white/5 shadow-xl opacity-40"
      />
      <motion.div 
        animate={{ rotate: isHovered ? 4 : 2, y: isHovered ? -8 : -2, x: isHovered ? 8 : 2 }}
        className="absolute inset-0 bg-stone-800 rounded-2xl border border-white/5 shadow-xl opacity-60"
      />
      <div className="absolute inset-0 glass rounded-2xl overflow-hidden shadow-2xl transition-all border border-white/10 z-10">
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center overflow-hidden">
          {mainThumbnail ? (
            <img src={convertFileSrc(mainThumbnail)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-700" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#2a221e]">
              <Layers className="w-12 h-12 text-stone-700" strokeWidth={1.25} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
          <div className="absolute top-3 left-3 px-2 py-1 bg-[color:var(--accent)] rounded-full flex items-center gap-1.5 shadow-2xl z-20">
            <Layers size={10} className="text-stone-950" />
            <span className="text-[9px] font-black text-stone-950 uppercase tracking-widest">{playlist.itemCount} Videos</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all duration-500">
                <Play size={20} fill="currentColor" />
             </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-1 bg-gradient-to-t from-black to-transparent z-10">
          <h3 className="text-[13px] font-bold text-stone-100 leading-[1.3] truncate">{playlist.title.replace(/_/g, " ")}</h3>
        </div>
      </div>
    </motion.div>
  );
};
const VideoCard = ({
  file,
  index,
}: {
  file: MediaFile;
  index: number;
}) => {
  const handlePlayFile = useRuforgeStore((s) => s.handlePlayFile);
  const activeMenu = useRuforgeStore((s) => s.activeMenu);
  const setGalleryActiveMenu = useRuforgeStore((s) => s.setGalleryActiveMenu);
  const extracting = useRuforgeStore((s) => !!s.extractingByPath[file.path]);
  const [isHovered, setIsHovered] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [views, setViews] = useState(() => {
    const saved = localStorage.getItem(`views-${file.path}`);
    return saved ? parseInt(saved) : 0;
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const stillPoster = file.thumbnailPath ?? file.ruforgePosterPath;

  const formatDuration = (seconds: number) => {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (isHovered && videoRef.current) {
      videoRef.current.play().catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0.1;
    }
  }, [isHovered]);

  const handlePlayAction = async () => {
    const newViews = views + 1;
    setViews(newViews);
    localStorage.setItem(`views-${file.path}`, newViews.toString());
    void handlePlayFile(file);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setGalleryActiveMenu({ path: file.path, x: e.clientX, y: e.clientY });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.5) }}
      className="group relative flex flex-col gap-3 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onClick={handlePlayAction}
      onContextMenu={handleContextMenu}
    >
      {/* Thumbnail Area */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#1D1613] shadow-lg transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-black/40 border border-white/5">
        {isHovered ? (
          <>
            <video 
              ref={videoRef}
              src={`${convertFileSrc(file.path)}#t=0.1`} 
              preload="metadata" 
              muted={previewMuted}
              playsInline
              autoPlay
              className="absolute inset-0 w-full h-full object-cover transition-all duration-700 scale-105 opacity-100" 
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewMuted(!previewMuted);
              }}
              className="absolute top-2 right-2 p-2 glass hover:bg-white/10 rounded-full text-white z-40 transition-all active:scale-90"
            >
              {previewMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </>
        ) : stillPoster ? (
          <img 
            src={convertFileSrc(stillPoster)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#2a221e]">
            <Video className="w-12 h-12 text-stone-700" strokeWidth={1.25} aria-hidden />
          </div>
        )}
        
        <div className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${isHovered ? 'opacity-0' : 'opacity-100'}`} />
        
        {file.duration > 0 && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded-md text-[10px] font-black text-white tracking-wider z-20">
            {formatDuration(file.duration)}
          </div>
        )}

        {(() => {
          const bar = getPlaybackThumbnailBar(file.path, file.duration);
          if (!bar.show) return null;
          return (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-30 overflow-hidden">
              <div
                className={`h-full bg-[color:var(--accent)] shadow-[0_0_8px_var(--accent)] ${bar.completed ? "opacity-90" : ""}`}
                style={{ width: `${bar.widthPct}%` }}
              />
            </div>
          );
        })()}

        {extracting && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center space-y-2 z-30">
            <Loader2 className="animate-spin text-[color:var(--accent)]" size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--accent)]">Extracting...</span>
          </div>
        )}

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ring-1 ring-inset ring-white/20 rounded-2xl" />
      </div>

      {/* Info Area */}
      <div className="flex gap-3 px-1 transition-transform duration-300 group-hover:translate-y-0.5">
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-bold text-stone-100 leading-[1.3] line-clamp-2 group-hover:text-[color:var(--accent)] transition-colors duration-300 mb-1">
            {file.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "")}
          </h3>
          
          <div className="flex flex-col text-[11px] text-stone-500 font-semibold space-y-0.5">
            <div className="flex items-center gap-1.5 group-hover:text-stone-400 transition-colors">
              <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
            </div>
            <div className="flex items-center gap-1 text-stone-600">
              <span>{views} {views === 1 ? 'view' : 'views'}</span>
              <span className="text-[8px] opacity-40">•</span>
              <span>{new Date(file.created * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>

        <div className="relative self-start mt-0.5">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setGalleryActiveMenu({ path: file.path, x: rect.right, y: rect.bottom });
            }} 
            className={`p-1 rounded-full transition-all duration-200 ${activeMenu?.path === file.path ? 'bg-white/10 text-stone-100' : 'text-stone-600 opacity-0 group-hover:opacity-100 hover:bg-white/5 hover:text-stone-300'}`}
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>
      
      {/* Background Tab Effect */}
      <div className="absolute -inset-2 bg-stone-900/0 group-hover:bg-stone-900/20 rounded-3xl -z-10 transition-all duration-500 scale-95 group-hover:scale-100 shadow-2xl shadow-black/0 group-hover:shadow-black/20" />
    </motion.div>
  );
};

export const MediaView = ({
  onPlaylistClick,
}: {
  onPlaylistClick: (playlist: PlaylistCollection) => void;
}) => {
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const gridDensity = useRuforgeStore((s) => s.settings.gridDensity);
  const searchQuery = useRuforgeStore((s) => s.searchValue);
  const filter = useRuforgeStore((s) => s.galleryFilter);
  const notify = useRuforgeStore((s) => s.notify);
  const entries = useRuforgeStore((s) => s.entries);
  const galleryLoading = useRuforgeStore((s) => s.galleryLoading);
  const activeMenu = useRuforgeStore((s) => s.activeMenu);
  const setGalleryActiveMenu = useRuforgeStore((s) => s.setGalleryActiveMenu);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const setGalleryExtractingPath = useRuforgeStore((s) => s.setGalleryExtractingPath);
  const handlePlayFile = useRuforgeStore((s) => s.handlePlayFile);

  const handleDelete = async (file: MediaFile) => {
    if (confirm(`Are you sure you want to delete "${file.name}"?`)) {
      try {
        await invoke("delete_media", { videoPath: file.path });
        notify("Video deleted successfully.");
        void fetchEntries();
      } catch (e) {
        console.error(e);
        notify("Failed to delete video.");
      }
    }
    setGalleryActiveMenu(null);
  };

  const handleExtract = async (file: MediaFile) => {
    setGalleryExtractingPath(file.path);
    try {
      await invoke("extract_frames", { videoPath: file.path });
      notify("Previews generated successfully.");
      await fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true });
    } catch (e) {
      console.error(e);
      notify("Failed to generate previews.");
    } finally {
      setGalleryExtractingPath(null);
      setGalleryActiveMenu(null);
    }
  };

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries, outputDir, saveToInternal]);

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

  const gridLayoutClass =
    gridDensity === "Cozy"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-x-8 gap-y-16"
      : gridDensity === "Compact"
        ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-8"
        : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-12";

  const filteredEntries = entries.filter((entry) => {
    const title = entry.kind === 'media' ? entry.name : entry.title;
    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filter === 'all') return true;
    if (entry.kind === 'playlist') return false;

    const file = entry as MediaFile;
    const dur = file.duration;
    const progress = getWatchProgress(file.path, dur);

    if (filter === 'in-progress') {
      return progress > 0 && !isVideoWatched(file.path, dur);
    }

    if (filter === 'watched') {
      return isVideoWatched(file.path, dur);
    }

    return true;
  });

  const groupedEntries = groupEntriesByDate(filteredEntries);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="h-full flex flex-col"
      onClick={() => setGalleryActiveMenu(null)}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.group')) return;
        e.preventDefault();
        setGalleryActiveMenu(null);
      }}
    >
      {/* Header */}
      <div className="px-10 pt-16 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-stone-50">Video Library</h1>
          <p className="text-stone-400 font-medium text-sm mt-1">Browse and manage your downloaded videos.</p>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 overflow-y-auto px-10 pb-32 scrollbar-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={filter}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
        {galleryLoading ? (
          <div className="flex justify-center py-40">
            <Loader2 className="animate-spin text-[color:var(--accent)] opacity-20" size={60} />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-40 text-center text-stone-500 font-black tracking-widest text-sm uppercase">
            No videos found.
          </div>
        ) : (
          <div className="space-y-16">
            {Object.entries(groupedEntries).map(([dateLabel, groupEntries]) => (
              <section key={dateLabel} className="space-y-8">
                <div className="flex items-center space-x-6">
                  <h2 className="text-[11px] font-black text-[color:var(--accent)] opacity-80 tracking-[0.4em] uppercase flex items-center space-x-4">
                    <span className="w-12 h-[1px] bg-[color:var(--accent)] opacity-30 rounded-full" />
                    <span>{dateLabel}</span>
                  </h2>
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-[color-mix(in_srgb,var(--accent),transparent_90%)] to-transparent" />
                  <span className="text-[9px] font-black text-stone-600 uppercase tracking-widest">{groupEntries.length} {groupEntries.length === 1 ? 'Video' : 'Videos'}</span>
                </div>

                <div className={gridLayoutClass}>
                  {groupEntries.map((entry, i) => {
                    if (entry.kind === 'playlist') {
                      return (
                        <PlaylistStackCard 
                          key={entry.path} 
                          playlist={entry} 
                          onClick={() => onPlaylistClick(entry)} 
                        />
                      );
                    }
                    
                    const file = entry as MediaFile;
                    return (
                      <VideoCard 
                        key={file.path}
                        file={file}
                        index={i}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Global Context Menu */}
      <AnimatePresence>
        {activeMenu && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="fixed bg-[#1D1613]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden min-w-[200px]"
            style={{ 
              left: Math.min(activeMenu.x, window.innerWidth - 220), 
              top: Math.min(activeMenu.y, window.innerHeight - 150) 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const entry = entries.find(e => e.path === activeMenu.path);
              if (!entry || entry.kind !== 'media') return null;
              const file = entry as MediaFile;
              return (
                <div className="p-1.5">
                  <div className="px-3 py-2 border-b border-white/5 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 truncate">{file.name}</p>
                  </div>
                  <button 
                    onClick={() => { void handlePlayFile(file); setGalleryActiveMenu(null); }}
                    className="w-full px-3 py-2.5 flex items-center space-x-3 hover:bg-white/5 transition-colors text-stone-300 hover:text-white rounded-lg group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--accent),transparent_88%)] flex items-center justify-center group-hover:bg-[color:var(--accent)] group-hover:text-stone-900 transition-all">
                      <Play size={14} fill="currentColor" />
                    </div>
                    <span className="text-xs font-bold">Play Video</span>
                  </button>
                  <button 
                    onClick={() => handleExtract(file)}
                    className="w-full px-3 py-2.5 flex items-center space-x-3 hover:bg-white/5 transition-colors text-stone-300 hover:text-[color:var(--accent)] rounded-lg"
                  >
                    <ImageIcon size={16} />
                    <span className="text-xs font-bold">Generate Previews</span>
                  </button>
                  <div className="h-px bg-white/5 my-1 mx-2" />
                  <button 
                    onClick={() => handleDelete(file)}
                    className="w-full px-3 py-2.5 flex items-center space-x-3 hover:bg-red-500/10 transition-colors text-stone-300 hover:text-red-500 rounded-lg"
                  >
                    <Trash2 size={16} />
                    <span className="text-xs font-bold">Delete</span>
                  </button>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

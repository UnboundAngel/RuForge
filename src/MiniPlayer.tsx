import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import logo from "./assets/neotubeIcon.png";
import { XCircle, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1, Pin } from "lucide-react";
import { MediaFile } from "./types";

const Waveform = ({ isPaused }: { isPaused: boolean }) => {
  return (
    <div className="flex items-end space-x-[3px] h-4">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            height: isPaused ? 4 : [8, 16, 10, 20, 6][i % 5],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
            delay: i * 0.08,
          }}
          className="w-[2px] bg-amber-500/80 rounded-full"
        />
      ))}
    </div>
  );
};

export default function MiniPlayer() {
  const [playingFile, setPlayingFile] = useState<MediaFile | null>(null);
  const [library, setLibrary] = useState<MediaFile[]>([]);
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>([]);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [isCursorVisible, setIsCursorVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const cursorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (playingFile) {
      invoke<string[]>("extract_frames", { videoPath: playingFile.path })
        .then(setScrubberThumbs)
        .catch(console.error);
    } else {
      setScrubberThumbs([]);
    }
  }, [playingFile]);

  const [winSize, setWinSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWinSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isSmallMode = winSize.width < 450 || winSize.height < 300;
  const isNarrow = winSize.width < 400;
  const isMini = winSize.width < 340;

  useEffect(() => {
    const handleMouseMove = () => {
      setIsCursorVisible(true);
      if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
      cursorTimeout.current = setTimeout(() => setIsCursorVisible(false), 2000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (cursorTimeout.current) clearTimeout(cursorTimeout.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        seek(-15);
      } else if (e.key === "ArrowRight") {
        seek(15);
      } else if (e.key === " ") {
        togglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playingFile, isPaused]); // Added isPaused to ensure togglePlay is fresh

  const [isPinned, setIsPinned] = useState(() => localStorage.getItem("miniplayer-pinned") === "true");
  const [isFocused, setIsFocused] = useState(true);
  const [volumeLabel, setVolumeLabel] = useState(() => {
    const saved = localStorage.getItem("miniplayer-volume");
    return saved ? Math.round(parseFloat(saved) * 100) : 100;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastAppliedVolume = useRef<number | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setAlwaysOnTop(isPinned).catch(console.error);
  }, [isPinned]);

  useEffect(() => {
    const savedPos = localStorage.getItem("miniplayer-pos");
    if (savedPos && videoRef.current && playingFile) {
      videoRef.current.currentTime = parseFloat(savedPos);
    }
  }, [playingFile]);

  useEffect(() => {
    if (videoRef.current) {
      const targetVol = volumeLabel / 100;
      videoRef.current.volume = targetVol;
      lastAppliedVolume.current = targetVol;
    }
  }, [playingFile, volumeLabel]);

  const savePlaybackPos = () => {
    if (videoRef.current) {
      localStorage.setItem("miniplayer-pos", videoRef.current.currentTime.toString());
    }
  };

  useEffect(() => {
    const interval = setInterval(savePlaybackPos, 5000);
    return () => clearInterval(interval);
  }, []);

  const [outputDir] = useState(() => {
    return localStorage.getItem("ruforge-output-dir") || "C:\\Downloads";
  });

  useEffect(() => {
    const loadLibrary = async () => {
      try {
        const data = await invoke<MediaFile[]>("scan_gallery", { dir: outputDir });
        setLibrary(data);
      } catch (e) {
        console.error(e);
      }
    };
    loadLibrary();
  }, [outputDir]);

  useEffect(() => {
    const win = getCurrentWindow();
    
    const onBlur = () => setIsFocused(false);
    const onFocus = () => setIsFocused(true);

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      setIsFocused(focused);
    });

    return () => { 
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      unlistenFocus.then(f => f()); 
    };
  }, []);

  const handleMouseEnter = async () => {
    setIsHovering(true);
    const win = getCurrentWindow();
    await win.setFocus();
  };

  useEffect(() => {
    const unlisten = listen<MediaFile>("play-media", (event) => {
      setPlayingFile(event.payload);
      import("@tauri-apps/api/event").then(({ emit }) => emit("stop-playback"));
    });

    const unlistenStop = listen("stop-playback", () => {
      setPlayingFile(null);
    });

    return () => { 
      unlisten.then(f => f()); 
      unlistenStop.then(f => f());
    };
  }, []);

  useEffect(() => {
    const notifyPlay = async () => {
      if (playingFile) {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === 'granted';
        }
        if (permissionGranted) {
          sendNotification({ title: 'RuForge Playing', body: playingFile.name });
        }
      }
    };
    notifyPlay();
  }, [playingFile]);

  const volumeRampRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const adjustVolume = (delta: number) => {
    if (!videoRef.current) return;
    if (volumeRampRef.current) clearInterval(volumeRampRef.current);
    
    const start = videoRef.current.volume;
    const target = Math.max(0, Math.min(1, start + delta));
    const distance = target - start;
    if (Math.abs(distance) < 0.001) return;

    const duration = 100; // ms
    const steps = 10;
    const stepTime = duration / steps;
    let currentStep = 0;

    volumeRampRef.current = setInterval(() => {
      currentStep++;
      if (videoRef.current) {
        videoRef.current.volume = Math.max(0, Math.min(1, start + (distance * (currentStep / steps))));
      }
      if (currentStep >= steps) {
        clearInterval(volumeRampRef.current!);
        volumeRampRef.current = null;
      }
    }, stepTime);

    setVolumeLabel(Math.round(target * 100));
    localStorage.setItem("miniplayer-volume", target.toString());
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!videoRef.current) return;
    
    // Request window focus on interaction. The onFocusChanged listener will handle the opacity.
    getCurrentWindow().setFocus();

    // Unmute on scroll if muted
    if (videoRef.current.muted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }

    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    adjustVolume(delta);
    setShowVolume(true);
    
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const { currentTime, duration } = videoRef.current;
    setCurrentTime(currentTime);
    setDuration(duration);
    setProgress((currentTime / duration) * 100);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    videoRef.current.currentTime = percent * videoRef.current.duration;
  };

  const handleMouseMoveScrubber = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverProgress(x / rect.width);
  };

  useEffect(() => {
    if (!isPaused) {
      setIsGalleryHovered(false);
    }
  }, [isPaused]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
      savePlaybackPos();
    }
  };

  const seek = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime += seconds;
  };

  const showGallery = !isSmallMode && (!playingFile || isPaused || isGalleryHovered);

  return (
    <div 
      className={`h-screen w-screen bg-black overflow-hidden border border-amber-900/40 rounded-[32px] select-none relative group/mini shadow-2xl transition-opacity duration-700 ${isFocused ? 'opacity-100' : 'opacity-75'} ${!isCursorVisible && !isPaused ? 'cursor-none' : 'cursor-default'}`}
      onWheel={handleWheel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovering(false)}
    >
      <style>{`
        @keyframes slideSquiggle {
          from { transform: translateX(0); }
          to { transform: translateX(-40px); }
        }
      `}</style>

      {/* Dynamic Volume/Mute Overlay (Mini Flush Bottom Right) */}
      <AnimatePresence>
        {showVolume && (
          <motion.div 
            initial={{ opacity: 0, y: 10, x: 10 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 10, x: 10 }}
            className={`absolute bottom-0 right-0 z-[80] bg-black/80 backdrop-blur-2xl border-t border-l border-white/10 rounded-tl-2xl ${isMini ? 'p-2 space-x-2' : isNarrow ? 'p-3 space-x-3' : 'p-4 space-x-3'} flex items-center pointer-events-none shadow-2xl`}
          >
            <div className="text-amber-500">
              {isMuted ? <VolumeX size={isMini ? 12 : 16} /> : volumeLabel > 50 ? <Volume2 size={isMini ? 12 : 16} /> : <Volume1 size={isMini ? 12 : 16} />}
            </div>
            <div className="flex flex-col">
              <span className={`${isMini ? 'text-[9px]' : 'text-xs'} font-black text-amber-500 leading-none`}>{isMuted ? "MUTED" : `${volumeLabel}%`}</span>
            </div>
            {!isMuted && (
              <div className={`${isMini ? 'w-[2px] h-3' : 'w-1 h-6'} bg-stone-900/50 rounded-full relative overflow-hidden ml-1`}>
                  <motion.div 
                    className="absolute bottom-0 left-0 right-0 bg-amber-500 rounded-full"
                    initial={{ height: 0 }}
                    animate={{ height: `${volumeLabel}%` }}
                  />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className="absolute top-0 left-0 right-0 h-10 z-[60] cursor-move" 
        onPointerDown={() => getCurrentWindow().startDragging()}
      />

      <div className="absolute top-0 left-0 right-0 h-14 z-[70] opacity-0 group-hover/mini:opacity-100 transition-opacity duration-300 pointer-events-none">
         <div className="relative z-10 flex items-center justify-end px-4 h-full">
            <button 
              onClick={async () => {
                if (playingFile && videoRef.current) {
                  localStorage.setItem("miniplayer-pos", videoRef.current.currentTime.toString());
                  localStorage.setItem("miniplayer-volume", videoRef.current.volume.toString());
                  emit("send-to-main", playingFile);
                  getCurrentWindow().close();
                }
              }}
              className="text-stone-500 hover:text-amber-500 transition-all cursor-pointer pointer-events-auto p-1.5 hover:bg-white/5 rounded-full"
              title="Send to Main"
            >
              <Icon icon="tabler:arrow-forward-up" width="18" height="18" />
            </button>
            <button 
              onClick={async () => {
                const newPinned = !isPinned;
                setIsPinned(newPinned);
                localStorage.setItem("miniplayer-pinned", newPinned.toString());
                const win = getCurrentWindow();
                await win.setAlwaysOnTop(newPinned);
              }}
              className={`text-stone-500 hover:text-amber-500 transition-all cursor-pointer pointer-events-auto p-1.5 hover:bg-white/5 rounded-full ${isPinned ? 'text-amber-500' : ''}`}
              title={isPinned ? "Unpin" : "Pin"}
            >
              <Pin size={14} strokeWidth={2.5} className={isPinned ? 'fill-current' : ''} />
            </button>
            <button 
              onPointerDown={(e) => {
                e.stopPropagation();
                getCurrentWindow().close();
              }} 
              className="text-stone-500 hover:text-amber-500 transition-all cursor-pointer pointer-events-auto p-1.5 hover:bg-white/5 rounded-full"
              title="Close"
            >
              <XCircle size={14} strokeWidth={2.5} />
            </button>
         </div>
      </div>

      <motion.div 
        animate={{ bottom: showGallery ? 112 : 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 200 }}
        className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center bg-black"
      >
         {playingFile ? (
            <>
              <video 
                key={playingFile.path}
                ref={videoRef}
                autoPlay 
                className={`${isSmallMode ? 'w-24 h-24 absolute left-6 rounded-2xl object-cover shadow-2xl border border-white/5' : 'w-full h-full object-contain'} cursor-pointer pointer-events-auto transition-all duration-500 z-20`}
                src={convertFileSrc(playingFile.path)}
                onPause={() => setIsPaused(true)}
                onPlay={() => {
                  setIsPaused(false);
                  setIsGalleryHovered(false);
                  if (videoRef.current) videoRef.current.volume = volumeLabel / 100;
                }}
                onLoadedData={(e) => {
                  e.currentTarget.volume = volumeLabel / 100;
                }}
                onTimeUpdate={handleTimeUpdate}
                onClick={togglePlay}
                onAuxClick={(e) => {
                  if (e.button === 1 && videoRef.current) {
                    getCurrentWindow().setFocus();
                    const nextMuted = !videoRef.current.muted;
                    videoRef.current.muted = nextMuted;
                    setIsMuted(nextMuted);
                    setShowVolume(true);
                    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
                    volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 2000);
                  }
                }}
              />
              
              {isSmallMode && (
                <div className="absolute inset-0 pl-36 pr-8 flex flex-col justify-center pointer-events-none">
                   <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0 flex-1 mr-4">
                        <p className="text-[11px] font-black text-amber-500 truncate uppercase tracking-widest">{playingFile.name}</p>
                        <p className="text-[9px] font-bold text-stone-500 uppercase tracking-tighter">System Audio Active</p>
                      </div>
                      <Waveform isPaused={isPaused} />
                   </div>
                   <div className="w-full h-1 bg-stone-800 rounded-full overflow-hidden mb-4 pointer-events-auto cursor-pointer" onClick={handleSeek}>
                      <motion.div 
                         className="h-full bg-amber-500"
                         initial={{ width: 0 }}
                         animate={{ width: `${progress}%` }}
                      />
                   </div>
                   <div className="flex items-center space-x-8 text-stone-400 pointer-events-auto">
                      <button onClick={() => seek(-10)} className="hover:text-amber-500 transition"><SkipBack size={18} /></button>
                      <button onClick={togglePlay} className="text-amber-500 hover:scale-110 transition">{isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}</button>
                      <button onClick={() => seek(10)} className="hover:text-amber-500 transition"><SkipForward size={18} /></button>
                   </div>
                </div>
              )}

              {/* Custom Controls Bar */}
              <motion.div 
                initial={false}
                animate={{ 
                  y: !isSmallMode && ((isCursorVisible && isHovering) || isPaused || isGalleryHovered) ? 0 : 120,
                  opacity: !isSmallMode && ((isCursorVisible && isHovering) || isPaused || isGalleryHovered) ? 1 : 0 
                }}
                transition={{ type: "spring", damping: 30, stiffness: 200 }}
                className={`absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-xl rounded-t-[24px] ${isMini ? 'py-2.5 px-4 space-y-3' : isNarrow ? 'py-3.5 px-5 space-y-3.5' : 'py-4 px-6 space-y-4'} flex flex-col pointer-events-auto border-t border-white/5 shadow-2xl z-20`}
                onMouseEnter={() => {
                  setIsHovering(true);
                  if (isPaused) setIsGalleryHovered(true);
                }}
              >
                {/* True Squiggly Line Progress Area */}
                <div 
                  className={`w-full ${isMini ? 'h-5' : 'h-8'} cursor-pointer relative group flex items-center`}
                  onClick={handleSeek}
                  onMouseMove={handleMouseMoveScrubber}
                  onMouseLeave={() => setHoverProgress(null)}
                >
                  <AnimatePresence>
                    {hoverProgress !== null && scrubberThumbs.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.8 }}
                        className="absolute bottom-full mb-4 z-[100] pointer-events-none"
                        style={{ left: `${hoverProgress * 100}%`, transform: 'translateX(-50%)' }}
                      >
                        <div className="relative p-1.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                          <img 
                            src={convertFileSrc(scrubberThumbs[Math.min(Math.floor(hoverProgress * scrubberThumbs.length), scrubberThumbs.length - 1)])} 
                            className="w-32 h-18 object-cover rounded-xl"
                            alt="preview"
                          />
                          <div className="absolute bottom-2 left-2 right-2 flex justify-center">
                             <span className="text-[9px] font-black text-amber-500 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
                               {formatTime(hoverProgress * duration)}
                             </span>
                          </div>
                        </div>
                        <div className="w-px h-4 bg-amber-500/50 mx-auto mt-1" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className={`w-full relative ${isMini ? 'h-[2px]' : 'h-1'} group-hover:h-2 transition-all duration-300`}>
                    <div className="absolute inset-0 bg-stone-800/80 rounded-full overflow-hidden" />
                    <div 
                      className="absolute top-0 bottom-0 left-0 transition-all duration-100 flex items-center justify-end overflow-hidden"
                      style={{ width: `${progress}%` }}
                    >
                      <svg className="absolute left-0 h-full w-[2000px] pointer-events-none" preserveAspectRatio="none" style={{
                        animation: !isPaused ? 'slideSquiggle 1s linear infinite' : 'none'
                      }}>
                         {!isPaused ? (
                           <path d="M0,2 Q5,0 10,2 T20,2 T30,2 T40,2 T50,2 T60,2 T70,2 T80,2 T90,2 T100,2 T110,2 T120,2 T130,2 T140,2 T150,2 T160,2 T170,2 T180,2 T190,2 T200,2 T210,2 T220,2 T230,2 T240,2 T250,2 T260,2 T270,2 T280,2 T290,2 T300,2 T310,2 T320,2 T330,2 T340,2 T350,2 T360,2 T370,2 T380,2 T390,2 T400,2 T410,2 T420,2 T430,2 T440,2 T450,2 T460,2 T470,2 T480,2 T490,2 T500,2 T510,2 T520,2 T530,2 T540,2 T550,2 T560,2 T570,2 T580,2 T590,2 T600,2 T610,2 T620,2 T630,2 T640,2 T650,2 T660,2 T670,2 T680,2 T690,2 T700,2 T710,2 T720,2 T730,2 T740,2 T750,2 T760,2 T770,2 T780,2 T790,2 T800,2 T810,2 T820,2 T830,2 T840,2 T850,2 T860,2 T870,2 T880,2 T890,2 T900,2 T910,2 T920,2 T930,2 T940,2 T950,2 T960,2 T970,2 T980,2 T990,2 T1000,2 T1010,2 T1020,2 T1030,2 T1040,2 T1050,2 T1060,2 T1070,2 T1080,2 T1090,2 T1100,2 T1110,2 T1120,2 T1130,2 T1140,2 T1150,2 T1160,2 T1170,2 T1180,2 T1190,2 T1200,2 T1210,2 T1220,2 T1230,2 T1240,2 T1250,2 T1260,2 T1270,2 T1280,2 T1290,2 T1300,2 T1310,2 T1320,2 T1330,2 T1340,2 T1350,2 T1360,2 T1370,2 T1380,2 T1390,2 T1400,2 T1410,2 T1420,2 T1430,2 T1440,2 T1450,2 T1460,2 T1470,2 T1480,2 T1490,2 T1500,2 T1510,2 T1520,2 T1530,2 T1540,2 T1550,2 T1560,2 T1570,2 T1580,2 T1590,2 T1600,2 T1610,2 T1620,2 T1630,2 T1640,2 T1650,2 T1660,2 T1670,2 T1680,2 T1690,2 T1700,2 T1710,2 T1720,2 T1730,2 T1740,2 T1750,2 T1760,2 T1770,2 T1780,2 T1790,2 T1800,2 T1810,2 T1820,2 T1830,2 T1840,2 T1850,2 T1860,2 T1870,2 T1880,2 T1890,2 T1900,2 T1910,2 T1920,2 T1930,2 T1940,2 T1950,2 T1960,2 T1970,2 T1980,2 T1990,2 T2000,2" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                         ) : (
                           <line x1="0" y1="2" x2="2000" y2="2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                         )}
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className={`flex items-center ${isMini ? 'space-x-3' : 'space-x-4'}`}>
                    <button onClick={() => seek(-15)} className="text-stone-400 hover:text-amber-400 transition"><Icon icon="tabler:rewind-backward-15" width={isMini ? 16 : 22} /></button>
                    <button onClick={togglePlay} className="text-amber-500 hover:text-amber-400 transition">{isPaused ? <Play size={isMini ? 16 : 20} fill="currentColor" /> : <Pause size={isMini ? 16 : 20} fill="currentColor" />}</button>
                    <button onClick={() => seek(15)} className="text-stone-400 hover:text-amber-400 transition"><Icon icon="tabler:rewind-forward-15" width={isMini ? 16 : 22} /></button>
                  </div>
                  <div className={`${isMini ? 'text-[8px]' : 'text-[10px]'} font-bold text-stone-500 tracking-wider`}>
                    -{formatTime(duration - currentTime)}
                  </div>
                  <div className={`flex items-center ${isMini ? 'space-x-1.5' : 'space-x-2'} text-stone-500`}>
                    <AnimatePresence mode="wait">
                      {!showVolume && (
                        <motion.div 
                          key="static-vol"
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }} 
                          exit={{ opacity: 0 }}
                          className={`flex items-center ${isMini ? 'space-x-1' : 'space-x-2'}`}
                        >
                           {isMuted ? <VolumeX size={isMini ? 12 : 16} className="text-amber-500/50" /> : <Volume2 size={isMini ? 12 : 16} />}
                           <span className={`${isMini ? 'text-[8px]' : 'text-[10px]'} font-bold`}>{isMuted ? "MUTED" : `${volumeLabel}%`}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            </>
          ) : (           
            <div className="flex flex-col items-center space-y-4 opacity-20 w-full h-full justify-center pointer-events-auto">
              <img src={logo} className="w-16 h-16 rounded-2xl grayscale pointer-events-none" alt="" />
              <p className="text-[9px] text-stone-500 font-black uppercase tracking-[0.3em] pointer-events-none">Waiting for Content</p>
            </div>
          )}
      </motion.div>


      {/* Bottom Interactive Area - Wraps library strip for stable hover state */}
      <div 
        className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col justify-end"
        onMouseEnter={() => {
          if (isPaused) setIsGalleryHovered(true);
        }}
        onMouseLeave={() => setIsGalleryHovered(false)}
      >
        {/* Library Strip */}
        <motion.div 
           initial={false}
           animate={{ 
             y: showGallery ? 0 : 120,
             opacity: showGallery ? 1 : 0
           }}
           transition={{ type: "spring", damping: 30, stiffness: 200 }}
           className="w-full h-28 glass-elevated border-t border-white/5 flex flex-col overflow-hidden shadow-2xl pointer-events-auto relative z-10"
        >
           <div className="h-28 overflow-x-auto overflow-y-hidden scrollbar-none px-4 py-4 flex items-center space-x-3 pointer-events-auto">
            {library.map((file) => (
              <button 
                key={file.path}
                onClick={() => setPlayingFile(file)}
                className={`flex-shrink-0 w-32 h-full rounded-xl overflow-hidden relative group border-2 transition-all ${playingFile?.path === file.path ? 'border-amber-500 shadow-lg shadow-amber-900/20' : 'border-transparent opacity-60 hover:opacity-100'}`}
              >
                <video src={`${convertFileSrc(file.path)}#t=0.1`} preload="metadata" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                <p className="absolute bottom-1 left-2 right-2 text-[7px] font-black text-amber-50 truncate uppercase tracking-tighter">
                  {file.name}
                </p>
              </button>
            ))}
            {library.length === 0 && (
              <p className="text-[8px] text-stone-600 font-bold uppercase tracking-widest w-full text-center">Library Empty</p>
            )}
         </div>
      </motion.div>
      </div>
    </div>
  );
}

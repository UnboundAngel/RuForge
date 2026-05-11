import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Repeat,
  Gauge,
  Monitor,
} from "lucide-react";
import { MediaFile } from "../types";

interface PlayerViewProps {
  file: MediaFile;
  onBack: () => void;
  onMiniPlayerToggle: () => void;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const PlayerView = ({ file, onBack, onMiniPlayerToggle }: PlayerViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("miniplayer-volume");
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [scrubberHoverPos, setScrubberHoverPos] = useState(0);
  const [isHoveringScrubber, setIsHoveringScrubber] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubberThumbs, setScrubberThumbs] = useState<string[]>([]);

  useEffect(() => {
    if (file) {
      invoke<string[]>("extract_frames", { videoPath: file.path })
        .then(setScrubberThumbs)
        .catch(console.error);
    } else {
      setScrubberThumbs([]);
    }
  }, [file]);

  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [clickFlash, setClickFlash] = useState<"play" | "pause" | null>(null);

  // Restore saved playback position
  useEffect(() => {
    if (videoRef.current) {
      const savedPos = localStorage.getItem("miniplayer-pos");
      if (savedPos) videoRef.current.currentTime = parseFloat(savedPos);
      videoRef.current.volume = volume;
    }
  }, [file]);

  // Sync volume/mute to video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
      localStorage.setItem("miniplayer-volume", volume.toString());
    }
  }, [volume, isMuted]);

  // Sync loop
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = isLooping;
  }, [isLooping]);

  // Sync playback speed
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Fullscreen change listener
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-10);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
          break;
        case "KeyM":
          setIsMuted((m) => !m);
          break;
        case "KeyF":
          toggleFullscreen();
          break;
        case "KeyL":
          setIsLooping((l) => !l);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, isPaused]);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play();
      setIsPaused(false);
      setClickFlash("play");
    } else {
      vid.pause();
      setIsPaused(true);
      setClickFlash("pause");
      localStorage.setItem("miniplayer-pos", vid.currentTime.toString());
    }
    setTimeout(() => setClickFlash(null), 500);
  }, []);

  const skip = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime += seconds;
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handlePopOut = async () => {
    try {
      if (videoRef.current) {
        localStorage.setItem("miniplayer-pos", videoRef.current.currentTime.toString());
        localStorage.setItem("miniplayer-volume", videoRef.current.volume.toString());
      }
      await invoke("open_mini_player");
      setTimeout(() => emit("play-media", file), 500);
      onMiniPlayerToggle();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid || !isFinite(vid.duration)) return;
    setCurrentTime(vid.currentTime);
    setProgress((vid.currentTime / vid.duration) * 100);
    if (vid.buffered.length > 0) {
      setBuffered((vid.buffered.end(vid.buffered.length - 1) / vid.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    vid.volume = volume;
    vid.playbackRate = playbackSpeed;
  };

  // Scrubber drag
  const getScrubPosition = (e: { clientX: number }): number => {
    const rect = scrubberRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const applyScrub = (pos: number) => {
    if (videoRef.current && isFinite(videoRef.current.duration)) {
      videoRef.current.currentTime = pos * videoRef.current.duration;
    }
  };

  const handleScrubMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsScrubbing(true);
    applyScrub(getScrubPosition(e));
    const onMove = (ev: MouseEvent) => applyScrub(getScrubPosition(ev));
    const onUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Volume drag
  const getVolumePosition = (e: { clientX: number }): number => {
    const rect = volumeRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const handleVolumeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVolumeDragging(true);
    changeVolume(getVolumePosition(e));
    const onMove = (ev: MouseEvent) => changeVolume(getVolumePosition(ev));
    const onUp = () => {
      setIsVolumeDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Controls auto-hide
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    if (!isPaused && !isScrubbing && !isVolumeDragging) {
      controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPaused, isScrubbing, isVolumeDragging]);

  useEffect(() => {
    resetControlsTimer();
  }, [isPaused, resetControlsTimer]);

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    const s = Math.floor(time % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => { if (!isPaused) setShowControls(false); }}
      className="absolute inset-0 bg-black flex flex-col select-none overflow-hidden z-50"
      style={{ cursor: showControls ? "default" : "none" }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={convertFileSrc(file.path)}
        className="w-full h-full object-contain"
        autoPlay
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => setIsPaused(true)}
        onPlay={() => setIsPaused(false)}
        onEnded={() => { if (!isLooping) setIsPaused(true); }}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onWheel={(e) => {
          changeVolume(Math.min(1, Math.max(0, volume + (e.deltaY > 0 ? -0.05 : 0.05))));
        }}
      />

      {/* Click flash feedback */}
      <AnimatePresence>
        {clickFlash && (
          <motion.div
            key={clickFlash}
            initial={{ opacity: 0.8, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center pointer-events-none"
          >
            {clickFlash === "play"
              ? <Play className="w-10 h-10 text-white fill-white ml-1" />
              : <Pause className="w-10 h-10 text-white fill-white" />
            }
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Chrome */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 left-0 right-0 px-8 pt-6 pb-20 flex items-start justify-between z-50 bg-gradient-to-b from-black/85 via-black/30 to-transparent pointer-events-auto"
          >
            <div className="flex items-center gap-5">
              <button
                onClick={onBack}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/5 border border-white/10 backdrop-blur-xl hover:bg-white/15 transition-all active:scale-90"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h2 className="text-lg font-black tracking-tight text-white leading-tight truncate max-w-xl">
                  {file.name}
                </h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] font-black tracking-widest text-amber-500 uppercase px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-md">
                    LOCAL
                  </span>
                  <span className="text-[10px] font-black tracking-widest text-stone-500 uppercase">
                    {fileSizeMB} MB
                  </span>
                  {playbackSpeed !== 1 && (
                    <span className="text-[10px] font-black tracking-widest text-sky-400 uppercase px-2 py-0.5 bg-sky-400/10 border border-sky-400/20 rounded-md">
                      {playbackSpeed}×
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handlePopOut}
              title="Launch MiniPlayer"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl hover:bg-white/15 transition-all active:scale-90 text-stone-400 hover:text-amber-400"
            >
              <Monitor className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 px-8 pb-8 pt-24 z-50 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-auto"
          >
            {/* Scrubber */}
            <div
              ref={scrubberRef}
              className={`w-full relative cursor-pointer group/scrubber py-3 -my-3 ${isScrubbing ? "cursor-grabbing" : ""}`}
              onMouseDown={handleScrubMouseDown}
              onMouseMove={(e) => {
                const rect = scrubberRef.current?.getBoundingClientRect();
                if (!rect) return;
                setScrubberHoverPos(((e.clientX - rect.left) / rect.width) * 100);
                setIsHoveringScrubber(true);
              }}
              onMouseLeave={() => setIsHoveringScrubber(false)}
            >
              <div className={`w-full rounded-full relative transition-all duration-150 ${isScrubbing || isHoveringScrubber ? "h-3" : "h-1.5"} bg-white/15`}>
                <div className="absolute top-0 left-0 h-full bg-white/20 rounded-full" style={{ width: `${buffered}%` }} />
                <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.4)]" style={{ width: `${progress}%` }} />
                {isHoveringScrubber && (
                  <div className="absolute top-0 left-0 h-full bg-white/10 rounded-full pointer-events-none" style={{ width: `${scrubberHoverPos}%` }} />
                )}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full border-2 border-amber-500 shadow-lg transition-opacity ${isHoveringScrubber || isScrubbing ? "opacity-100" : "opacity-0"}`}
                  style={{ left: `${progress}%` }}
                />
                {isHoveringScrubber && isFinite(duration) && (
                  <AnimatePresence>
                    {scrubberThumbs.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.8 }}
                        className="absolute bottom-full mb-8 z-[100] pointer-events-none"
                        style={{ left: `${scrubberHoverPos}%`, transform: 'translateX(-50%)' }}
                      >
                        <div className="relative p-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                          <img 
                            src={convertFileSrc(scrubberThumbs[Math.min(Math.floor((scrubberHoverPos/100) * scrubberThumbs.length), scrubberThumbs.length - 1)])} 
                            className="w-48 h-27 object-cover rounded-xl"
                            alt="preview"
                          />
                          <div className="absolute bottom-3 left-3 right-3 flex justify-center">
                             <span className="text-xs font-black text-amber-500 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                               {formatTime((scrubberHoverPos / 100) * duration)}
                             </span>
                          </div>
                        </div>
                        <div className="w-px h-6 bg-amber-500/50 mx-auto mt-2" />
                      </motion.div>
                    ) : (
                      <div
                        className="absolute -top-9 -translate-x-1/2 bg-stone-950 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black tracking-wider text-white pointer-events-none whitespace-nowrap shadow-xl"
                        style={{ left: `${scrubberHoverPos}%` }}
                      >
                        {formatTime((scrubberHoverPos / 100) * duration)}
                      </div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </div>

            {/* Controls Bar */}
            <div className="flex items-center justify-between mt-3 px-2">
              {/* Left */}
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 flex items-center justify-center text-stone-200 hover:text-amber-400 active:scale-90 transition-all"
                >
                  {isPaused
                    ? <Play className="w-8 h-8 fill-current ml-0.5" />
                    : <Pause className="w-8 h-8 fill-current" />
                  }
                </button>

                <button onClick={() => skip(-15)} title="Back 15s (←)" className="p-2 text-stone-400 hover:text-amber-400 transition-colors active:scale-90">
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button onClick={() => skip(15)} title="Forward 15s (→)" className="p-2 text-stone-400 hover:text-amber-400 transition-colors active:scale-90">
                  <RotateCw className="w-5 h-5" />
                </button>

                {/* Volume */}
                <div className="flex items-center gap-3 group/vol ml-2">
                  <button
                    onClick={() => setIsMuted((m) => !m)}
                    title="Mute (M)"
                    className="p-2 text-stone-400 hover:text-amber-400 transition-colors"
                  >
                    <VolumeIcon className="w-5 h-5" />
                  </button>
                  <div
                    ref={volumeRef}
                    className={`relative rounded-full cursor-pointer transition-all ${isVolumeDragging ? "cursor-grabbing" : ""} w-0 opacity-0 group-hover/vol:w-24 group-hover/vol:opacity-100 h-1.5 bg-white/15`}
                    onMouseDown={handleVolumeMouseDown}
                  >
                    <div className="absolute top-0 left-0 h-full bg-amber-500 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.5)]" style={{ width: `${isMuted ? 0 : volume * 100}%` }} />
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow border border-amber-500 transition-opacity ${isVolumeDragging ? "opacity-100" : "opacity-0 group-hover/vol:opacity-100"}`}
                      style={{ left: `${isMuted ? 0 : volume * 100}%` }}
                    />
                  </div>
                </div>

                {/* Time */}
                <div className="text-xs font-medium text-stone-400 font-mono tracking-wider ml-4 flex items-center gap-2">
                  <span className="text-stone-200">{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{isFinite(duration) ? formatTime(duration) : "0:00"}</span>
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLooping((l) => !l)}
                  title="Loop (L)"
                  className={`p-2.5 rounded-xl transition-all ${isLooping ? "text-amber-500 bg-amber-500/10 border border-amber-500/20" : "text-stone-500 hover:text-white"}`}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                {/* Speed */}
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu((s) => !s)}
                    className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 ${showSpeedMenu ? "text-amber-500 bg-amber-500/10 border border-amber-500/20" : "text-stone-500 hover:text-white"}`}
                  >
                    <Gauge className="w-4 h-4" />
                    <span className="text-[10px] font-black tracking-wider">{playbackSpeed}×</span>
                  </button>
                  <AnimatePresence>
                    {showSpeedMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-3 right-0 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-[100px]"
                      >
                        {PLAYBACK_SPEEDS.map((speed) => (
                          <button
                            key={speed}
                            onClick={() => { setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                            className={`w-full px-4 py-2.5 text-left text-[11px] font-black tracking-widest transition-colors ${
                              playbackSpeed === speed ? "bg-amber-500 text-stone-950" : "text-stone-400 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {speed}×
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button onClick={handlePopOut} title="Mini Player" className="p-2.5 rounded-xl text-stone-500 hover:text-white transition-all">
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button onClick={toggleFullscreen} title="Fullscreen (F)" className="p-2.5 rounded-xl text-stone-500 hover:text-white transition-all">
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

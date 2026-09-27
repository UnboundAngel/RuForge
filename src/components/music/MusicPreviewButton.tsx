import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionalMainAudioPlayback } from "@/playback/mainAudioPlaybackContext";
import type { OutsideTrack } from "./musicOutsideRecommend";
import {
  type PreviewStatus,
  setMusicPreviewMainBridge,
  stopMusicPreview,
  toggleMusicPreview,
  useMusicPreview,
} from "./musicPreview";

/**
 * Mount once where previews can start. Lets a preview pause the main player and hand it back,
 * stops the preview when the user starts the main player themselves, and when the page closes.
 */
export function useMusicPreviewBridge(): void {
  const playback = useOptionalMainAudioPlayback();
  const ref = useRef(playback);
  ref.current = playback;

  useEffect(() => {
    setMusicPreviewMainBridge({
      playing: () => !!ref.current && !ref.current.paused,
      pause: () => {
        if (ref.current && !ref.current.paused) ref.current.togglePlay();
      },
      resume: () => {
        if (ref.current?.paused) ref.current.togglePlay();
      },
    });
    return () => {
      stopMusicPreview();
      setMusicPreviewMainBridge(null);
    };
  }, []);

  const mainPaused = playback?.paused ?? true;
  useEffect(() => {
    if (!mainPaused && useMusicPreview.getState().videoId) stopMusicPreview({ resumeMain: false });
  }, [mainPaused]);
}

/** This song's preview state, or null when it isn't the one previewing. */
export function useSongPreview(videoId: string): { status: PreviewStatus | null; progress: number } {
  const status = useMusicPreview((s) => (s.videoId === videoId ? s.status : null));
  const progress = useMusicPreview((s) => (s.videoId === videoId ? s.progress : 0));
  return { status, progress };
}

const SPRING = { type: "spring", stiffness: 520, damping: 30 } as const;

/** Round play button for a song the user doesn't own yet; streams it without downloading. */
export function MusicPreviewButton({ track, status }: { track: OutsideTrack; status: PreviewStatus | null }) {
  useEffect(
    () => () => {
      if (useMusicPreview.getState().videoId === track.videoId) stopMusicPreview();
    },
    [track.videoId],
  );

  const icon = status === "loading" ? "loading" : status === "playing" ? "pause" : "play";
  return (
    <button
      type="button"
      onClick={() => void toggleMusicPreview(track)}
      className={cn(
        "rf-music-press rf-music-tooltip-anchor absolute bottom-2 left-2 w-10 h-10 flex items-center justify-center rounded-full bg-black/70 text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
        "transition-[opacity,translate,scale,background-color] duration-200 hover:scale-105 hover:bg-black/85",
        status
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0",
      )}
      aria-label={status === "playing" ? `Pause preview of ${track.title}` : `Preview ${track.title}`}
      data-tooltip={status === "playing" ? "Pause preview" : status === "paused" ? "Resume preview" : "Preview"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={icon}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={SPRING}
          className="flex"
        >
          {icon === "loading" ? (
            <Loader2 size={18} strokeWidth={2.75} className="animate-spin" />
          ) : icon === "pause" ? (
            <Pause size={18} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={18} fill="currentColor" strokeWidth={0} className="translate-x-px" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** Thin bar along the cover's bottom edge while a preview plays. */
export function MusicPreviewProgress({ progress }: { progress: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden>
      <div
        className="h-full bg-[var(--music-accent)] transition-[width] duration-300 ease-linear"
        style={{ width: `${Math.round(progress * 1000) / 10}%` }}
      />
    </div>
  );
}

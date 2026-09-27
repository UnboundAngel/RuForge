import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionalMainAudioPlayback } from "@/playback/mainAudioPlaybackContext";
import {
  type PreviewSource,
  type PreviewStatus,
  previewId,
  previewTitle,
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
    if (!mainPaused && useMusicPreview.getState().id) stopMusicPreview({ resumeMain: false });
  }, [mainPaused]);
}

/** This song's preview state, or null when it isn't the one previewing. */
export function useSongPreview(source: PreviewSource): { status: PreviewStatus | null; progress: number } {
  const id = previewId(source);
  const status = useMusicPreview((s) => (s.id === id ? s.status : null));
  const progress = useMusicPreview((s) => (s.id === id ? s.progress : 0));
  return { status, progress };
}

const SPRING = { type: "spring", stiffness: 520, damping: 30 } as const;

/** Round play button that previews a song without adding it or touching the main queue. */
export function MusicPreviewButton({ source, status }: { source: PreviewSource; status: PreviewStatus | null }) {
  const id = previewId(source);
  const title = previewTitle(source);
  useEffect(
    () => () => {
      if (useMusicPreview.getState().id === id) stopMusicPreview();
    },
    [id],
  );

  const icon = status === "loading" ? "loading" : status === "playing" ? "pause" : "play";
  return (
    <button
      type="button"
      onClick={() => void toggleMusicPreview(source)}
      className={cn(
        "rf-music-press rf-music-tooltip-anchor absolute bottom-2 left-2 w-10 h-10 flex items-center justify-center rounded-full bg-black/70 text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
        "transition-[opacity,translate,scale,background-color] duration-200 hover:scale-105 hover:bg-black/85",
        status
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0",
      )}
      aria-label={status === "playing" ? `Pause preview of ${title}` : `Preview ${title}`}
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

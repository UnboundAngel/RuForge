import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import { cn } from "@/lib/utils";
import { artistKeyFromFile, rawArtistFromFile } from "./musicArtist";
import { MusicVolumeControl } from "./MusicVolumeControl";
import { MusicLikeButton } from "./MusicLikeButton";

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const barBtnClass =
  "flex h-8 w-8 shrink-0 items-center justify-center transition-opacity opacity-60 hover:opacity-100";

type Props = {
  paused: boolean;
  currentTime: number;
  duration: number;
  expanded: boolean;
  playbackSpeed: number;
  hasChapters: boolean;
  hasPrevInQueue: boolean;
  hasNextInQueue: boolean;
  isDraggingRef: React.MutableRefObject<boolean>;
  onTogglePlay: () => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onSkipBySeconds: (delta: number) => void;
  onJumpPrevChapter: () => void;
  onJumpNextChapter: () => void;
  onSetPlaybackSpeed: (speed: number) => void;
  onSeek: (seconds: number) => void;
  onPauseForScrub: () => boolean;
  onResumeAfterScrub: (wasPlaying: boolean) => void;
  onToggleExpand: () => void;
  /** Right panel toggle: omit to hide the button. */
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
};

export function NowPlayingBar({
  paused,
  currentTime,
  duration,
  expanded,
  playbackSpeed,
  hasChapters,
  hasPrevInQueue,
  hasNextInQueue,
  isDraggingRef,
  onTogglePlay,
  onSkipPrev,
  onSkipNext,
  onSkipBySeconds,
  onJumpPrevChapter,
  onJumpNextChapter,
  onSetPlaybackSpeed,
  onSeek,
  onPauseForScrub,
  onResumeAfterScrub,
  onToggleExpand,
  rightPanelOpen,
  onToggleRightPanel,
}: Props) {
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const isLooping = useRuforgeStore((s) => s.isLooping);
  const setVolume = useRuforgeStore((s) => s.setVolume);
  const setMuted = useRuforgeStore((s) => s.setMuted);
  const setLooping = useRuforgeStore((s) => s.setLooping);
  const handlePopOut = useRuforgeStore((s) => s.handlePopOut);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [morePanel, setMorePanel] = useState<"main" | "speed">("main");
  const [volumeInteractTick, setVolumeInteractTick] = useState(0);
  const utilitiesRef = useRef<HTMLDivElement>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMoreMenu) setMorePanel("main");
  }, [showMoreMenu]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (!utilitiesRef.current?.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showMoreMenu]);

  const seekToFraction = useCallback((clientX: number) => {
    const track = scrubTrackRef.current;
    if (!track || !duration) return;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(frac * duration);
  }, [duration, onSeek]);

  const handleScrubMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const wasPlaying = onPauseForScrub();
    seekToFraction(e.clientX);
    const onMove = (ev: MouseEvent) => { if (isDraggingRef.current) seekToFraction(ev.clientX); };
    const onUp = (ev: MouseEvent) => {
      isDraggingRef.current = false;
      seekToFraction(ev.clientX);
      onResumeAfterScrub(wasPlaying);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onPauseForScrub, onResumeAfterScrub, seekToFraction, isDraggingRef]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.05 : 0.05;
      const next = Math.max(0, Math.min(1, volume + step));
      setVolume(next);
      if (isMuted && next > 0) setMuted(false);
      setVolumeInteractTick((t) => t + 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [volume, isMuted, setVolume, setMuted]);

  const toggleLoop = useCallback(() => {
    setLooping(!isLooping);
  }, [isLooping, setLooping]);

  const coverPath = playingFile ? bestCoverPath(playingFile) : null;
  const coverSrc = coverPath ? convertFileSrc(coverPath) : null;
  const artist = playingFile ? rawArtistFromFile(playingFile) : "";
  const artistNavKey = playingFile ? artistKeyFromFile(playingFile) : "";
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  if (!playingFile) return null;

  return (
    <div
      ref={barRef}
      className="shrink-0"
      style={{
        height: "var(--music-nowplaying-height)",
        background: expanded ? "var(--music-bg)" : "var(--music-surface)",
      }}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,1fr)] items-center gap-x-4 px-4">
        <div className="flex items-center gap-2 min-w-0">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggleExpand}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleExpand();
            }
          }}
          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
          aria-label={expanded ? "Collapse player" : "Expand player"}
        >
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="w-12 h-12 shrink-0 object-cover"
              style={{ borderRadius: "var(--music-card-radius)" }}
            />
          ) : (
            <div
              className="w-12 h-12 shrink-0 flex items-center justify-center"
              style={{ borderRadius: "var(--music-card-radius)", background: "var(--music-surface-raised)", color: "var(--music-text-muted)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div className="min-w-0 flex-1" style={{ color: "var(--music-text-primary)" }}>
            <MarqueeText text={playingFile.name} className="text-sm font-medium leading-tight" layoutKey={playingFile.path} />
            {artist && artistNavKey && (
              <button
                type="button"
                className="text-xs mt-0.5 hover:underline w-full text-left truncate block"
                style={{ color: "var(--music-text-secondary)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  openMusicArtist(artistNavKey);
                }}
              >
                {artist}
              </button>
            )}
          </div>
        </div>
        <MusicLikeButton file={playingFile} className={cn(barBtnClass, "overflow-visible")} size={17} />
        </div>

        <div className="flex flex-col items-center justify-center gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onSkipPrev}
              disabled={!hasPrevInQueue && currentTime <= 3}
              className={cn(barBtnClass, "disabled:opacity-25")}
              style={{ color: "var(--music-text-primary)" }}
              aria-label="Previous track"
            >
              <Icon icon="tabler:player-track-prev-filled" width={17} />
            </button>
            <button
              type="button"
              onClick={() => onSkipBySeconds(-15)}
              className={cn(barBtnClass)}
              style={{ color: "var(--music-text-primary)" }}
              aria-label="Rewind 15 seconds"
            >
              <Icon icon="tabler:rewind-backward-15" width={18} />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
              style={{ background: "var(--music-text-primary)", color: "var(--music-bg)" }}
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused
                ? <Icon icon="tabler:player-play-filled" width={16} />
                : <Icon icon="tabler:player-pause-filled" width={16} />}
            </button>
            <button
              type="button"
              onClick={() => onSkipBySeconds(15)}
              className={cn(barBtnClass)}
              style={{ color: "var(--music-text-primary)" }}
              aria-label="Forward 15 seconds"
            >
              <Icon icon="tabler:rewind-forward-15" width={18} />
            </button>
            <button
              type="button"
              onClick={onSkipNext}
              disabled={!hasNextInQueue}
              className={cn(barBtnClass, "disabled:opacity-25")}
              style={{ color: "var(--music-text-primary)" }}
              aria-label="Next track"
            >
              <Icon icon="tabler:player-track-next-filled" width={17} />
            </button>
          </div>
          <div
            ref={scrubTrackRef}
            className="group/scrub w-full max-w-lg h-1 rounded-full cursor-pointer relative"
            style={{ background: "rgba(255,255,255,0.2)" }}
            onMouseDown={handleScrubMouseDown}
          >
            <div className="absolute inset-y-0 left-0 rounded-full pointer-events-none" style={{ width: `${pct}%`, background: "var(--music-text-primary)" }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full opacity-0 group-hover/scrub:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `${pct}%`, background: "var(--music-text-primary)" }}
            />
          </div>
        </div>

        <div
          ref={utilitiesRef}
          className="flex items-center justify-end gap-0.5"
        >
          <button
            type="button"
            onClick={toggleLoop}
            className={cn(barBtnClass, isLooping && "opacity-100")}
            style={{ color: isLooping ? "var(--music-accent)" : "var(--music-text-primary)" }}
            aria-label={isLooping ? "Loop on" : "Loop off"}
          >
            <Icon icon={isLooping ? "streamline:arrow-infinite-loop" : "radix-icons:loop"} width={16} height={16} />
          </button>

          <MusicVolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolume={setVolume}
            onMuted={setMuted}
            interactTick={volumeInteractTick}
          />

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((s) => !s)}
              className={cn(barBtnClass, showMoreMenu && "opacity-100")}
              style={{ color: "var(--music-text-primary)" }}
              aria-label="More controls"
            >
              <Ellipsis size={16} />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full mb-2 right-0 z-50 min-w-[200px] overflow-hidden rounded-xl border shadow-2xl"
                  style={{ background: "var(--music-surface)", borderColor: "var(--music-border)" }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {morePanel === "main" ? (
                      <motion.div
                        key="more-main"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.12 }}
                        className="py-1"
                      >
                        {hasChapters && (
                          <>
                            <MoreMenuItem icon="tabler:chevron-left-pipe" label="Previous chapter" onClick={() => { onJumpPrevChapter(); setShowMoreMenu(false); }} />
                            <MoreMenuItem icon="tabler:chevron-right-pipe" label="Next chapter" onClick={() => { onJumpNextChapter(); setShowMoreMenu(false); }} />
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setMorePanel("speed")}
                          className="rf-music-more-row"
                        >
                          <span data-more-icon>
                            <Icon icon="tabler:gauge" width={15} />
                          </span>
                          <span className="flex-1">Playback speed</span>
                          <span className="tabular-nums opacity-70">{playbackSpeed}×</span>
                          <ChevronRight size={14} data-more-icon className="opacity-70" />
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="more-speed"
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.12 }}
                        className="py-1"
                      >
                        <button
                          type="button"
                          onClick={() => setMorePanel("main")}
                          className="rf-music-more-row"
                        >
                          <ChevronLeft size={14} data-more-icon />
                          Playback speed
                        </button>
                        {PLAYBACK_SPEEDS.map((speed) => (
                          <button
                            key={speed}
                            type="button"
                            onClick={() => onSetPlaybackSpeed(speed)}
                            data-selected={playbackSpeed === speed ? "true" : "false"}
                            className="rf-music-more-row tabular-nums"
                          >
                            {speed}×
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => void handlePopOut(currentTime, { paused, playbackSpeed })}
            className={cn(barBtnClass)}
            style={{ color: "var(--music-text-primary)" }}
            aria-label="Mini player"
          >
            <Icon icon="material-symbols:ad-group-outline" width={16} />
          </button>

          {onToggleRightPanel && (
            <button
              type="button"
              onClick={onToggleRightPanel}
              className={cn(barBtnClass, "rf-music-tooltip-anchor")}
              style={{ color: rightPanelOpen ? "var(--music-accent)" : "var(--music-text-primary)" }}
              aria-label={rightPanelOpen ? "Close queue panel" : "Open queue panel"}
              data-tooltip={rightPanelOpen ? "Close queue panel" : "Open queue panel"}
            >
              <Icon icon="material-symbols:queue-music-rounded" width={16} />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            className={cn(barBtnClass)}
            style={{ color: "var(--music-text-primary)" }}
            aria-label={expanded ? "Collapse player" : "Expand player"}
          >
            <Icon icon={expanded ? "tabler:arrows-minimize" : "tabler:arrows-maximize"} width={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MoreMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rf-music-more-row"
    >
      <span data-more-icon>
        <Icon icon={icon} width={15} />
      </span>
      {label}
    </button>
  );
}

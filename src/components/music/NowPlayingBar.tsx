import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { Ban, ChevronLeft, Ellipsis } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { useScrubberHover } from "@/hooks/useScrubberHover";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { bestCoverPath } from "@/mediaKind";
import { cn } from "@/lib/utils";
import { artistKeyFromFile, rawArtistFromFile } from "./musicArtist";
import { loopModeAriaLabel, loopModeIcon } from "@/playbackLoopStorage";
import {
  MUSIC_CROSSFADE_MAX_SEC,
  MUSIC_CROSSFADE_SUGGESTED_SEC,
} from "./musicCrossfadeStorage";
import { MusicVolumeControl } from "./MusicVolumeControl";
import { MusicLikeButton } from "./MusicLikeButton";
import { PlayPauseMorphIcon } from "@/components/ui/PlayPauseMorphIcon";
import {
  dismissMusicMenuPointer,
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MUSIC_MENU_WIDTH,
  MusicMenuPanel,
  MusicMenuRow,
  MusicMenuSection,
  MusicMenuSubmenuRow,
  useMusicMenuEscape,
} from "./musicMenuUi";

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const barBtnClass =
  "flex h-8 w-8 shrink-0 items-center justify-center transition-opacity opacity-60 hover:opacity-100";

type Props = {
  paused: boolean;
  currentTime: number;
  duration: number;
  expanded: boolean;
  playbackSpeed: number;
  crossfadeSec: number;
  hasChapters: boolean;
  hasPrevInQueue: boolean;
  hasNextInQueue: boolean;
  onTogglePlay: () => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onSkipBySeconds: (delta: number) => void;
  onJumpPrevChapter: () => void;
  onJumpNextChapter: () => void;
  onSetPlaybackSpeed: (speed: number) => void;
  onSetCrossfadeSec: (sec: number) => void;
  onBeginScrub: () => void;
  onReleaseScrub: (seconds: number) => void;
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
  crossfadeSec,
  hasChapters,
  hasPrevInQueue,
  hasNextInQueue,
  onTogglePlay,
  onSkipPrev,
  onSkipNext,
  onSkipBySeconds,
  onJumpPrevChapter,
  onJumpNextChapter,
  onSetPlaybackSpeed,
  onSetCrossfadeSec,
  onBeginScrub,
  onReleaseScrub,
  onToggleExpand,
  rightPanelOpen,
  onToggleRightPanel,
}: Props) {
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const loopMode = useRuforgeStore((s) => s.loopMode);
  const setVolume = useRuforgeStore((s) => s.setVolume);
  const setMuted = useRuforgeStore((s) => s.setMuted);
  const cycleLoopMode = useRuforgeStore((s) => s.cycleLoopMode);
  const handlePopOut = useRuforgeStore((s) => s.handlePopOut);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const removeDownloadJob = useRuforgeStore((s) => s.removeDownloadJob);

  const activeJobs = downloadJobs.filter(
    (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
  );
  const hasActiveDownloads = activeJobs.length > 0;

  const handleCancelAllDownloads = useCallback(() => {
    for (const job of activeJobs) {
      void removeDownloadJob(job.id, { manual: true });
    }
  }, [activeJobs, removeDownloadJob]);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [morePanel, setMorePanel] = useState<"main" | "speed" | "crossfade">("main");
  const [volumeInteractTick, setVolumeInteractTick] = useState(0);
  const utilitiesRef = useRef<HTMLDivElement>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const isScrubbingRef = useRef(false);
  const scrubPctRef = useRef<number | null>(null);
  const pendingReleaseRef = useRef(false);
  const pendingReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrubPct, setScrubPct] = useState<number | null>(null);
  const { hoverPercent, isHovering, onMouseMove, onMouseLeave } = useScrubberHover(scrubTrackRef);

  useEffect(() => {
    if (!showMoreMenu) setMorePanel("main");
  }, [showMoreMenu]);

  useMusicMenuEscape(showMoreMenu, () => setShowMoreMenu(false));

  useEffect(() => {
    if (!showMoreMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (!utilitiesRef.current?.contains(e.target as Node)) {
        dismissMusicMenuPointer(e);
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", onDoc, { capture: true });
    return () => document.removeEventListener("mousedown", onDoc, { capture: true });
  }, [showMoreMenu]);

  const clearPendingRelease = useCallback(() => {
    if (pendingReleaseTimeoutRef.current !== null) {
      clearTimeout(pendingReleaseTimeoutRef.current);
      pendingReleaseTimeoutRef.current = null;
    }
    scrubPctRef.current = null;
    pendingReleaseRef.current = false;
    setScrubPct(null);
  }, []);

  // Preview-on-release: clear the pending preview once currentTime catches
  // up to the seek target, with a timeout fallback so it can't get stuck.
  useEffect(() => {
    if (isScrubbingRef.current || scrubPctRef.current === null || !pendingReleaseRef.current) {
      return;
    }
    if (duration <= 0) return;
    const targetSec = (scrubPctRef.current / 100) * duration;
    if (Math.abs(currentTime - targetSec) < 0.35) {
      clearPendingRelease();
    }
  }, [currentTime, duration, clearPendingRelease]);

  // Track change: don't let a stale preview bleed into the next track.
  useEffect(() => {
    clearPendingRelease();
    isScrubbingRef.current = false;
  }, [playingFile?.path, clearPendingRelease]);

  useEffect(() => {
    return () => {
      if (pendingReleaseTimeoutRef.current !== null) {
        clearTimeout(pendingReleaseTimeoutRef.current);
      }
    };
  }, []);

  const previewFromClientX = useCallback((clientX: number) => {
    const track = scrubTrackRef.current;
    if (!track || !duration) return null;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const pct = frac * 100;
    scrubPctRef.current = pct;
    setScrubPct(pct);
    return frac * duration;
  }, [duration]);

  const handleScrubMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (pendingReleaseTimeoutRef.current !== null) {
      clearTimeout(pendingReleaseTimeoutRef.current);
      pendingReleaseTimeoutRef.current = null;
    }
    pendingReleaseRef.current = false;
    onBeginScrub();
    isScrubbingRef.current = true;
    previewFromClientX(e.clientX);

    const onMove = (ev: MouseEvent) => {
      if (!isScrubbingRef.current) return;
      previewFromClientX(ev.clientX);
    };

    const onUp = (ev: MouseEvent) => {
      if (!isScrubbingRef.current) return;
      const finalSec = previewFromClientX(ev.clientX);
      isScrubbingRef.current = false;
      onReleaseScrub(finalSec ?? currentTime);
      if (duration > 0) {
        pendingReleaseRef.current = true;
        pendingReleaseTimeoutRef.current = setTimeout(() => {
          clearPendingRelease();
        }, 500);
      } else {
        clearPendingRelease();
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [currentTime, duration, onBeginScrub, onReleaseScrub, previewFromClientX, clearPendingRelease]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const stepMag = volume < 0.25 ? 0.02 : 0.05;
      const step = e.deltaY > 0 ? -stepMag : stepMag;
      const next = Math.max(0, Math.min(1, volume + step));
      setVolume(next);
      if (isMuted && next > 0) setMuted(false);
      setVolumeInteractTick((t) => t + 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [volume, isMuted, setVolume, setMuted]);

  const toggleLoop = useCallback(() => {
    cycleLoopMode();
  }, [cycleLoopMode]);

  const coverPath = playingFile ? bestCoverPath(playingFile) : null;
  const coverSrc = coverPath ? convertFileSrc(coverPath) : null;
  const artist = playingFile ? rawArtistFromFile(playingFile) : "";
  const artistNavKey = playingFile ? artistKeyFromFile(playingFile) : "";
  const displayDuration =
    duration > 0
      ? duration
      : playingFile && playingFile.duration > 0
        ? playingFile.duration
        : 0;
  const pct =
    isScrubbingRef.current || scrubPctRef.current !== null
      ? (scrubPctRef.current ?? scrubPct ?? 0)
      : displayDuration > 0
        ? Math.min(100, (currentTime / displayDuration) * 100)
        : 0;

  const previewPct =
    scrubPct !== null ? (scrubPctRef.current ?? scrubPct) : hoverPercent;
  const showScrubHoverTime =
    displayDuration > 0 && (isHovering || scrubPct !== null);
  const scrubHoverTimeSec = (previewPct / 100) * displayDuration;

  const displayCurrentTime =
    scrubPct !== null && displayDuration > 0
      ? ((scrubPctRef.current ?? scrubPct) / 100) * displayDuration
      : currentTime;

  if (!playingFile) return null;

  return (
    <div
      ref={barRef}
      className="shrink-0"
      style={{
        height: "var(--music-nowplaying-height)",
        background: "var(--music-shell-chrome)",
      }}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,1fr)] items-center gap-x-4 px-4">
        <div className="flex items-center gap-2.5 min-w-0 w-fit max-w-full">
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
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
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
          <div className="min-w-0 max-w-[min(280px,32vw)]" style={{ color: "var(--music-text-primary)" }}>
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
        <MusicLikeButton file={playingFile} className="overflow-visible opacity-100 hover:opacity-100" size={17} />
        </div>

        <div className="flex h-full min-w-0 flex-col items-center justify-end gap-1 pb-2.5 pt-1">
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
              <PlayPauseMorphIcon playing={!paused} size={16} />
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
          <div className="relative w-full max-w-lg">
            <div
              ref={scrubTrackRef}
              className="group/scrub relative w-full cursor-pointer pb-0.5 pt-1.5"
              onMouseDown={handleScrubMouseDown}
              onMouseMove={(e) => {
                if (!isScrubbingRef.current) onMouseMove(e);
              }}
              onMouseLeave={onMouseLeave}
            >
              {showScrubHoverTime && (
                <div
                  className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                  style={{
                    left: `clamp(1.25rem, ${previewPct}%, calc(100% - 1.25rem))`,
                    color: "var(--music-text-primary)",
                    background: "rgba(0, 0, 0, 0.78)",
                    borderColor: "rgba(255, 255, 255, 0.14)",
                  }}
                >
                  {formatDuration(scrubHoverTimeSec)}
                </div>
              )}
              <div
                className="relative h-1 w-full rounded-full"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
                  style={{ width: `${pct}%`, background: "var(--music-text-primary)" }}
                />
                {showScrubHoverTime && (
                  <div
                    className="absolute inset-y-0 w-px pointer-events-none opacity-70"
                    style={{
                      left: `${previewPct}%`,
                      background: "var(--music-text-primary)",
                    }}
                  />
                )}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full opacity-0 group-hover/scrub:opacity-100 transition-opacity pointer-events-none"
                  style={{ left: `${pct}%`, background: "var(--music-text-primary)" }}
                />
              </div>
            </div>
            <div className="pointer-events-none mt-0.5 flex items-center justify-between select-none">
              <span
                className="text-[10px] tabular-nums"
                style={{ color: "var(--music-text-muted)" }}
              >
                {formatDuration(displayCurrentTime)}
              </span>
              <span
                className="text-[10px] tabular-nums"
                style={{ color: "var(--music-text-muted)" }}
              >
                {displayDuration > 0 ? formatDuration(displayDuration) : "--:--"}
              </span>
            </div>
          </div>
        </div>

        <div
          ref={utilitiesRef}
          className="flex items-center justify-end gap-0.5"
        >
          {hasActiveDownloads && (
            <button
              type="button"
              onClick={handleCancelAllDownloads}
              className={cn(barBtnClass, "opacity-50 hover:opacity-100")}
              style={{ color: "var(--music-text-primary)" }}
              aria-label="Stop all downloads"
            >
              <Ban size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={toggleLoop}
            className={cn(barBtnClass, loopMode !== "off" && "opacity-100")}
            style={{ color: loopMode !== "off" ? "var(--music-accent)" : "var(--music-text-primary)" }}
            aria-label={loopModeAriaLabel(loopMode)}
          >
            <Icon icon={loopModeIcon(loopMode)} width={16} height={16} />
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
                <>
                  <div
                    className="fixed inset-0 z-40"
                    aria-hidden
                    onMouseDown={(e) => {
                      dismissMusicMenuPointer(e);
                      setShowMoreMenu(false);
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.1, ease: "easeOut" }}
                    className="absolute bottom-full mb-2 right-0 z-50"
                    style={{ width: MUSIC_MENU_WIDTH }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {morePanel === "main" ? (
                        <motion.div
                          key="more-main"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ duration: 0.12 }}
                        >
                          <MusicMenuPanel>
                            {hasChapters && (
                              <MusicMenuSection label="Chapters" tone={MUSIC_MENU_TONES.transport}>
                                <MusicMenuRow
                                  tone={MUSIC_MENU_TONES.transport}
                                  label="Previous chapter"
                                  icon={<Icon icon="tabler:chevron-left-pipe" width={MUSIC_MENU_ICON_SIZE} />}
                                  onClick={() => { onJumpPrevChapter(); setShowMoreMenu(false); }}
                                />
                                <MusicMenuRow
                                  tone={MUSIC_MENU_TONES.transport}
                                  label="Next chapter"
                                  icon={<Icon icon="tabler:chevron-right-pipe" width={MUSIC_MENU_ICON_SIZE} />}
                                  onClick={() => { onJumpNextChapter(); setShowMoreMenu(false); }}
                                />
                              </MusicMenuSection>
                            )}
                            <MusicMenuSection label="Playback" tone={MUSIC_MENU_TONES.playback}>
                              <MusicMenuSubmenuRow
                                tone={MUSIC_MENU_TONES.playback}
                                label="Playback speed"
                                value={`${playbackSpeed}×`}
                                icon={<Icon icon="tabler:gauge" width={MUSIC_MENU_ICON_SIZE} />}
                                onClick={() => setMorePanel("speed")}
                              />
                              <MusicMenuSubmenuRow
                                tone={MUSIC_MENU_TONES.playback}
                                label="Crossfade"
                                value={crossfadeSec <= 0 ? "Off" : `${crossfadeSec}s`}
                                icon={<Icon icon="tabler:arrows-exchange" width={MUSIC_MENU_ICON_SIZE} />}
                                onClick={() => setMorePanel("crossfade")}
                              />
                            </MusicMenuSection>
                          </MusicMenuPanel>
                        </motion.div>
                      ) : morePanel === "speed" ? (
                        <motion.div
                          key="more-speed"
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={{ duration: 0.12 }}
                        >
                          <MusicMenuPanel>
                            <MusicMenuSection label="Speed" tone={MUSIC_MENU_TONES.playback}>
                              <MusicMenuRow
                                tone={MUSIC_MENU_TONES.playback}
                                label="Back"
                                icon={<ChevronLeft size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
                                onClick={() => setMorePanel("main")}
                              />
                              {PLAYBACK_SPEEDS.map((speed) => (
                                <MusicMenuRow
                                  key={speed}
                                  tone={MUSIC_MENU_TONES.playback}
                                  label={`${speed}×`}
                                  active={playbackSpeed === speed}
                                  icon={<Icon icon="tabler:gauge" width={MUSIC_MENU_ICON_SIZE} />}
                                  onClick={() => onSetPlaybackSpeed(speed)}
                                />
                              ))}
                            </MusicMenuSection>
                          </MusicMenuPanel>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="more-crossfade"
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={{ duration: 0.12 }}
                        >
                          <MusicMenuPanel>
                            <MusicMenuSection label="Crossfade" tone={MUSIC_MENU_TONES.playback}>
                              <MusicMenuRow
                                tone={MUSIC_MENU_TONES.playback}
                                label="Back"
                                icon={<ChevronLeft size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
                                onClick={() => setMorePanel("main")}
                              />
                              <div className="px-1.5 py-1">
                                <div className="flex items-center justify-between gap-3 pb-2 text-[11px] text-white/55">
                                  <span className="tabular-nums">
                                    {crossfadeSec <= 0 ? "Off" : `${crossfadeSec}s`}
                                  </span>
                                  {crossfadeSec <= 0 ? (
                                    <button
                                      type="button"
                                      className="text-[11px] text-white/70 hover:text-white border-0 bg-transparent cursor-pointer p-0"
                                      onClick={() => onSetCrossfadeSec(MUSIC_CROSSFADE_SUGGESTED_SEC)}
                                    >
                                      Use {MUSIC_CROSSFADE_SUGGESTED_SEC}s
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="text-[11px] text-white/70 hover:text-white border-0 bg-transparent cursor-pointer p-0"
                                      onClick={() => onSetCrossfadeSec(0)}
                                    >
                                      Off
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={MUSIC_CROSSFADE_MAX_SEC}
                                  step={1}
                                  value={crossfadeSec}
                                  onChange={(e) => onSetCrossfadeSec(Number(e.target.value))}
                                  className="w-full accent-[var(--music-accent)]"
                                  aria-label="Crossfade duration"
                                />
                              </div>
                            </MusicMenuSection>
                          </MusicMenuPanel>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </>
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

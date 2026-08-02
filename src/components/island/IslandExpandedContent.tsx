import { Icon } from "@iconify/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { DynamicIslandContent } from "./DynamicIsland";
import { loopModeAriaLabel, loopModeIcon } from "@/playbackLoopStorage";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import { IslandVolumeControl } from "./IslandVolumeControl";
import { IslandWaveformHoverSlot } from "./IslandWaveformHoverSlot";
import {
  ISLAND_SKIP_TRANSITION,
  islandSkipExpandedVariants,
  type IslandSkipDir,
} from "./islandSkipMotion";

const islandBtnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center text-zinc-300 transition-[color,transform] duration-150 hover:text-white active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none";

/** Half-width of rewind | play | forward cluster for wing sizing. */
const TRANSPORT_HALF_PX = 50;
const CENTER_GAP_PX = 4;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function IslandTitleCopy({ text, trackKey }: { text: string; trackKey: string }) {
  const [copied, setCopied] = useState(false);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideRef.current) clearTimeout(hideRef.current);
    },
    [],
  );

  const handleCopy = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      try {
        await writeText(text);
      } catch {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          return;
        }
      }
      setCopied(true);
      if (hideRef.current) clearTimeout(hideRef.current);
      hideRef.current = setTimeout(() => setCopied(false), 1600);
    },
    [text],
  );

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        className="block w-full min-w-0 cursor-pointer text-left transition-[color] duration-150 hover:text-white/90"
        aria-label={`Copy title: ${text}`}
        onClick={handleCopy}
      >
        <HoverMarqueeText
          text={text}
          className="text-[16px] font-medium leading-tight text-white"
          layoutKey={trackKey}
        />
      </button>
      <AnimatePresence>
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute left-0 top-full z-20 mt-0.5 text-[11px] tracking-wide text-zinc-400"
          >
            Copied
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function IslandIconButton({
  label,
  onClick,
  disabled,
  active,
  className,
  children,
}: {
  label: string;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`pointer-events-auto ${islandBtnClass} ${active ? "text-[color:var(--accent)]" : ""} ${className ?? ""}`}
    >
      <span className="pointer-events-none">{children}</span>
    </button>
  );
}

function CoverArtButton({
  src,
  onOpenPlayer,
}: {
  src: string | null;
  onOpenPlayer?: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl shadow-lg"
      aria-label="Open player"
      onClick={(e) => {
        e.stopPropagation();
        onOpenPlayer?.(e);
      }}
    >
      {src ? (
        <img src={src} alt="" className="pointer-events-none h-full w-full scale-110 object-cover" />
      ) : (
        <div className="pointer-events-none h-full w-full bg-white/10" />
      )}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <Icon icon="tabler:arrows-maximize" width={20} className="pointer-events-none text-white" />
      </div>
    </button>
  );
}

function IslandScrubber({
  content,
  onSeek,
  onBeginScrub,
  onReleaseScrub,
}: {
  content: DynamicIslandContent;
  onSeek?: (seconds: number) => void;
  onBeginScrub?: () => void;
  onReleaseScrub?: (seconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const innerTrackRef = useRef<HTMLDivElement>(null);
  const dragTrackRectRef = useRef<{ left: number; width: number } | null>(null);
  const isScrubbingRef = useRef(false);
  const scrubPctRef = useRef<number | null>(null);
  const pendingReleaseRef = useRef(false);
  const releaseTargetSecRef = useRef<number | null>(null);
  const pendingReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPct, setScrubPct] = useState<number | null>(null);

  const clearPendingRelease = useCallback(() => {
    if (pendingReleaseTimeoutRef.current !== null) {
      clearTimeout(pendingReleaseTimeoutRef.current);
      pendingReleaseTimeoutRef.current = null;
    }
    scrubPctRef.current = null;
    pendingReleaseRef.current = false;
    releaseTargetSecRef.current = null;
    setScrubPct(null);
  }, []);

  useEffect(() => {
    if (isScrubbingRef.current || scrubPctRef.current === null || !pendingReleaseRef.current) {
      return;
    }
    const targetSec = releaseTargetSecRef.current;
    if (targetSec === null) return;
    if (Math.abs(content.currentTime - targetSec) < 0.35) {
      clearPendingRelease();
    }
  }, [content.currentTime, clearPendingRelease]);

  // Track change: a stale preview from the previous track must not bleed
  // into the next (e.g. track ended/advanced while a release was pending).
  useEffect(() => {
    clearPendingRelease();
    isScrubbingRef.current = false;
    setIsScrubbing(false);
  }, [content.trackKey, clearPendingRelease]);

  useEffect(() => {
    return () => {
      if (pendingReleaseTimeoutRef.current !== null) {
        clearTimeout(pendingReleaseTimeoutRef.current);
      }
    };
  }, []);

  const previewFromClientX = useCallback(
    (clientX: number, trackRect?: { left: number; width: number }) => {
      if (!content.duration || !content.canSeek) return null;
      const rect = trackRect ?? dragTrackRectRef.current;
      if (!rect || rect.width <= 0) return null;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const pct = ratio * 100;
      scrubPctRef.current = pct;
      setScrubPct(pct);
      return ratio * content.duration;
    },
    [content.canSeek, content.duration],
  );

  const displayPct =
    isScrubbingRef.current || scrubPctRef.current !== null
      ? (scrubPctRef.current ?? scrubPct ?? content.progress)
      : content.progress;
  const displayCurrentTime =
    scrubPctRef.current !== null && content.duration > 0
      ? (scrubPctRef.current / 100) * content.duration
      : content.currentTime;

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!content.canSeek || (!onSeek && !onReleaseScrub)) return;
      e.stopPropagation();
      e.preventDefault();
      onBeginScrub?.();
      isScrubbingRef.current = true;
      if (pendingReleaseTimeoutRef.current !== null) {
        clearTimeout(pendingReleaseTimeoutRef.current);
        pendingReleaseTimeoutRef.current = null;
      }
      pendingReleaseRef.current = false;
      releaseTargetSecRef.current = null;
      setIsScrubbing(true);
      const inner = innerTrackRef.current;
      const frozenRect = inner?.getBoundingClientRect();
      if (!frozenRect || frozenRect.width <= 0) return;
      dragTrackRectRef.current = { left: frozenRect.left, width: frozenRect.width };
      previewFromClientX(e.clientX, dragTrackRectRef.current);

      const onMove = (ev: globalThis.MouseEvent) => {
        if (!isScrubbingRef.current || !dragTrackRectRef.current) return;
        previewFromClientX(ev.clientX, dragTrackRectRef.current);
      };

      const onUp = (ev: globalThis.MouseEvent) => {
        if (!isScrubbingRef.current) return;
        const finalSec = dragTrackRectRef.current
          ? previewFromClientX(ev.clientX, dragTrackRectRef.current)
          : null;
        isScrubbingRef.current = false;
        dragTrackRectRef.current = null;
        setIsScrubbing(false);
        if (finalSec !== null) {
          if (onReleaseScrub) {
            onReleaseScrub(finalSec);
          } else {
            onSeek?.(finalSec);
          }
        }
        if (content.duration > 0 && finalSec !== null) {
          pendingReleaseRef.current = true;
          releaseTargetSecRef.current = finalSec;
          pendingReleaseTimeoutRef.current = setTimeout(() => {
            pendingReleaseTimeoutRef.current = null;
          }, 500);
        } else {
          clearPendingRelease();
        }
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [content.canSeek, content.duration, onBeginScrub, onReleaseScrub, onSeek, previewFromClientX, clearPendingRelease],
  );

  return (
    <div className="flex items-center gap-2 text-[12px] text-zinc-400">
      <span className="inline-block w-9 shrink-0 text-right tabular-nums">
        {formatClock(displayCurrentTime)}
      </span>
      <div
        ref={trackRef}
        className={`relative flex-1 py-2 -my-2 ${
          content.canSeek ? "cursor-pointer" : ""
        } ${isScrubbing ? "cursor-grabbing" : ""}`}
        onMouseDown={content.canSeek ? handleMouseDown : undefined}
      >
        <div
          ref={innerTrackRef}
          className="relative h-1.5 w-full overflow-visible rounded-full bg-zinc-800"
        >
          <div
            className={`absolute inset-y-0 left-0 rounded-full bg-white ${
              isScrubbing ? "" : "transition-[width] duration-150"
            }`}
            style={{ width: `${displayPct}%` }}
          />
        </div>
      </div>
      <span className="inline-block w-10 shrink-0 tabular-nums">
        {content.duration > 0
          ? `-${formatClock(Math.max(0, content.duration - displayCurrentTime))}`
          : "0:00"}
      </span>
    </div>
  );
}

type Props = {
  content: DynamicIslandContent;
  waveformLevels: readonly number[];
  skipDir?: IslandSkipDir;
  onPlayPause: (e: MouseEvent) => void;
  onSeek?: (seconds: number) => void;
  onBeginScrub?: () => void;
  onReleaseScrub?: (seconds: number) => void;
  onOpenPlayer?: (e: MouseEvent) => void;
  onSkipPrev?: (e: MouseEvent) => void;
  onSkipNext?: (e: MouseEvent) => void;
  onSkipBySeconds?: (delta: number) => (e: MouseEvent) => void;
  onVolume?: (v: number) => void;
  onMuted?: (m: boolean) => void;
  onToggleLoop?: (e: MouseEvent) => void;
  onPopOut?: (e: MouseEvent) => void;
};

export function IslandExpandedContent({
  content,
  waveformLevels,
  skipDir = 1,
  onPlayPause,
  onSeek,
  onBeginScrub,
  onReleaseScrub,
  onOpenPlayer,
  onSkipPrev,
  onSkipNext,
  onSkipBySeconds,
  onVolume,
  onMuted,
  onToggleLoop,
  onPopOut,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.1 } }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      className="pointer-events-auto absolute inset-0 flex flex-col justify-between p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative h-16 w-full overflow-hidden">
        <AnimatePresence initial={false} custom={skipDir} mode="popLayout">
          <motion.div
            key={content.trackKey || "empty"}
            custom={skipDir}
            variants={islandSkipExpandedVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={ISLAND_SKIP_TRANSITION}
            className="absolute inset-0 flex items-center gap-3 px-0.5"
          >
            <CoverArtButton src={content.coverSrc} onOpenPlayer={onOpenPlayer} />
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <IslandTitleCopy text={content.title} trackKey={content.trackKey} />
              {content.subtitle ? (
                <span className="truncate pt-0.5 text-[14px] text-zinc-400">{content.subtitle}</span>
              ) : null}
              {content.isStub && content.stubLabel ? (
                <span className="truncate pt-0.5 text-[12px] uppercase tracking-wide text-zinc-500">
                  {content.stubLabel}
                </span>
              ) : null}
            </div>
            <IslandWaveformHoverSlot
              levels={waveformLevels}
              coverSrc={content.coverSrc}
              accentColor={content.accentColor}
              muted={content.isStub}
              onPopOut={onPopOut}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {content.showExpandedControls ? (
        <div className="mt-auto space-y-2 px-0.5">
          <IslandScrubber
            content={content}
            onSeek={onSeek}
            onBeginScrub={onBeginScrub}
            onReleaseScrub={onReleaseScrub}
          />

          <div className="relative h-9 w-full">
            <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5">
              <IslandIconButton label="Rewind 15 seconds" onClick={onSkipBySeconds?.(-15)}>
                <Icon icon="tabler:rewind-backward-15" width={17} />
              </IslandIconButton>
              <button
                type="button"
                className="pointer-events-auto relative z-10 flex h-9 w-9 shrink-0 items-center justify-center text-white transition-transform hover:scale-105 active:scale-[0.97]"
                onClick={onPlayPause}
                aria-label={content.paused ? "Play" : "Pause"}
              >
                <span className="pointer-events-none">
                  {content.paused ? (
                    <Icon icon="tabler:player-play-filled" width={22} />
                  ) : (
                    <Icon icon="tabler:player-pause-filled" width={22} />
                  )}
                </span>
              </button>
              <IslandIconButton label="Forward 15 seconds" onClick={onSkipBySeconds?.(15)}>
                <Icon icon="tabler:rewind-forward-15" width={17} />
              </IslandIconButton>
            </div>

            <div
              className={`pointer-events-none absolute inset-y-0 left-0 z-20 flex items-center gap-0.5 ${
                content.showTrackSkip ? "justify-end" : "justify-start pl-3"
              }`}
              style={{ width: `calc(50% - ${TRANSPORT_HALF_PX + CENTER_GAP_PX}px)` }}
            >
              <div className="pointer-events-none flex items-center gap-0.5">
                <IslandVolumeControl
                  volume={content.volume}
                  isMuted={content.isMuted}
                  onVolume={(v) => onVolume?.(v)}
                  onMuted={(m) => onMuted?.(m)}
                />
                {content.showTrackSkip ? (
                  <IslandIconButton
                    label="Previous track"
                    disabled={!content.hasPrev}
                    onClick={onSkipPrev}
                  >
                    <Icon icon="tabler:player-track-prev-filled" width={16} />
                  </IslandIconButton>
                ) : null}
              </div>
            </div>

            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center"
              style={{ width: `calc(50% - ${TRANSPORT_HALF_PX + CENTER_GAP_PX}px)` }}
            >
              <div className="pointer-events-none flex w-full items-center justify-between gap-0.5">
                {content.showTrackSkip ? (
                  <IslandIconButton
                    label="Next track"
                    disabled={!content.hasNext}
                    onClick={onSkipNext}
                  >
                    <Icon icon="tabler:player-track-next-filled" width={16} />
                  </IslandIconButton>
                ) : (
                  <span className="shrink-0" aria-hidden />
                )}
                <IslandIconButton
                  label={loopModeAriaLabel(content.loopMode)}
                  active={content.loopMode !== "off"}
                  onClick={onToggleLoop}
                >
                  <Icon
                    icon={loopModeIcon(content.loopMode)}
                    width={15}
                    height={15}
                  />
                </IslandIconButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

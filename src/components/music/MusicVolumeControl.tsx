import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_SIZE = 16;

type Props = {
  volume: number;
  isMuted: boolean;
  onVolume: (v: number) => void;
  onMuted: (m: boolean) => void;
  /** Bumps when volume changes from outside this control (e.g. bar wheel). */
  interactTick?: number;
};

function volumeWaveLevel(volume: number, isMuted: boolean): 0 | 1 | 2 | 3 {
  if (isMuted || volume <= 0) return 0;
  if (volume <= 0.33) return 1;
  if (volume <= 0.66) return 2;
  return 3;
}

function volumeHintClass(pct: number) {
  if (pct < 10) return "text-[15px] font-semibold tracking-tight";
  if (pct < 100) return "text-[13px] font-semibold tracking-tight";
  return "text-[12px] font-semibold tracking-tight";
}

function waveStrokeOpacity(line: number, level: 0 | 1 | 2 | 3) {
  if (level <= 0) return 0.22;
  return level >= line ? 1 : 0.24;
}

function clampPct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function MusicVolumeIcon({
  level,
  muted,
  className,
}: {
  level: 0 | 1 | 2 | 3;
  muted: boolean;
  className?: string;
}) {
  if (muted) {
    return <VolumeX size={ICON_SIZE} className={className} strokeWidth={2} />;
  }

  const waves = [
    "M14 9.5a4 4 0 0 1 0 5",
    "M15.54 8.46a5 5 0 0 1 0 7.07",
    "M19.07 4.93a10 10 0 0 1 0 14.14",
  ];

  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M11 5L6 9H2v6h4l5 4V5z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {waves.map((d, i) => {
        const line = i + 1;
        return (
          <motion.path
            key={d}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            initial={false}
            animate={{ opacity: waveStrokeOpacity(line, level) }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        );
      })}
    </svg>
  );
}

export function MusicVolumeControl({
  volume,
  isMuted,
  onVolume,
  onMuted,
  interactTick = 0,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const hideHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hintPulse, setHintPulse] = useState(false);

  const displayPct = isMuted ? 0 : clampPct(volume * 100);
  const waveLevel = volumeWaveLevel(volume, isMuted);
  const showHint = isHovering || isDragging || hintPulse;
  const iconActive = isHovering || isDragging || hintPulse;

  const clearHideHintTimer = useCallback(() => {
    if (hideHintTimer.current) {
      clearTimeout(hideHintTimer.current);
      hideHintTimer.current = null;
    }
  }, []);

  const scheduleHideHint = useCallback(() => {
    clearHideHintTimer();
    hideHintTimer.current = setTimeout(() => setHintPulse(false), 1400);
  }, [clearHideHintTimer]);

  const pulseHint = useCallback(() => {
    setHintPulse(true);
    scheduleHideHint();
  }, [scheduleHideHint]);

  useEffect(() => {
    if (interactTick <= 0) return;
    pulseHint();
  }, [interactTick, pulseHint]);

  useEffect(() => () => clearHideHintTimer(), [clearHideHintTimer]);

  const applyPct = useCallback((pct: number) => {
    const next = clampPct(pct);
    onVolume(next / 100);
    if (isMuted && next > 0) onMuted(false);
    pulseHint();
  }, [isMuted, onMuted, onVolume, pulseHint]);

  const seekToFraction = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    applyPct(frac * 100);
  }, [applyPct]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    pulseHint();
    seekToFraction(e.clientX);
    const onMove = (ev: MouseEvent) => {
      if (isDraggingRef.current) seekToFraction(ev.clientX);
    };
    const onUp = (ev: MouseEvent) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      seekToFraction(ev.clientX);
      if (!isHovering) scheduleHideHint();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [isHovering, pulseHint, scheduleHideHint, seekToFraction]);

  return (
    <div
      className="relative flex items-center gap-2 min-w-0"
      onMouseEnter={() => {
        setIsHovering(true);
        clearHideHintTimer();
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        if (!isDraggingRef.current) scheduleHideHint();
      }}
    >
      <div className="relative w-8 shrink-0">
        <AnimatePresence>
          {showHint && (
            <motion.div
              key="volume-hint"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="pointer-events-none absolute bottom-full left-0 right-0 z-10 mb-1 flex justify-center"
            >
              <span
                className={cn(
                  "inline-block w-[3ch] text-center tabular-nums leading-none",
                  volumeHintClass(displayPct),
                )}
                style={{ color: "var(--music-text-primary)" }}
              >
                {displayPct}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => onMuted(!isMuted)}
          className={cn(
            "flex h-8 w-8 items-center justify-center transition-opacity",
            iconActive ? "opacity-100" : "opacity-60 hover:opacity-100",
          )}
          style={{ color: "var(--music-text-primary)" }}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          <MusicVolumeIcon level={waveLevel} muted={isMuted} />
        </button>
      </div>

      <div
        ref={trackRef}
        className="relative h-4 min-w-[72px] max-w-[96px] w-[88px] shrink-0 cursor-pointer"
        onMouseDown={handleMouseDown}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayPct}
        aria-label="Volume"
      >
        <div
          className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-sm"
          style={{ background: "rgba(255,255,255,0.18)" }}
        />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-sm pointer-events-none"
          style={{
            width: `${displayPct}%`,
            background: "var(--music-text-primary)",
          }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 pointer-events-none"
          style={{
            left: `${displayPct}%`,
            borderColor: "var(--music-text-primary)",
            background: "var(--music-bg)",
          }}
        />
      </div>
    </div>
  );
}

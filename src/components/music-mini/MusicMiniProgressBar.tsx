import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

type Props = {
  currentTime: number;
  duration: number;
  onSeek: (pct: number) => void;
};

export function MusicMiniProgressBar({ currentTime, duration, onSeek }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);
  const pendingReleaseRef = useRef(false);
  const pendingReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frac =
    scrubFrac !== null
      ? scrubFrac
      : duration > 0
        ? Math.max(0, Math.min(1, currentTime / duration))
        : 0;
  const pct = frac * 100;
  const displayTime = duration > 0 ? frac * duration : currentTime;

  const clearPendingRelease = useCallback(() => {
    if (pendingReleaseTimeoutRef.current !== null) {
      clearTimeout(pendingReleaseTimeoutRef.current);
      pendingReleaseTimeoutRef.current = null;
    }
    pendingReleaseRef.current = false;
    setScrubFrac(null);
  }, []);

  // Clear the preview once currentTime catches up to the seek target, with
  // a timeout fallback so it can't get stuck.
  useEffect(() => {
    if (scrubbing || scrubFrac === null || !pendingReleaseRef.current) return;
    if (duration <= 0) return;
    const targetSec = scrubFrac * duration;
    if (Math.abs(currentTime - targetSec) < 0.35) {
      clearPendingRelease();
    }
  }, [currentTime, duration, scrubbing, scrubFrac, clearPendingRelease]);

  useEffect(() => {
    return () => {
      if (pendingReleaseTimeoutRef.current !== null) {
        clearTimeout(pendingReleaseTimeoutRef.current);
      }
    };
  }, []);

  const previewFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track || !duration) return null;
    const rect = track.getBoundingClientRect();
    const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setScrubFrac(next);
    return next;
  }, [duration]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!duration) return;
      e.preventDefault();
      if (pendingReleaseTimeoutRef.current !== null) {
        clearTimeout(pendingReleaseTimeoutRef.current);
        pendingReleaseTimeoutRef.current = null;
      }
      pendingReleaseRef.current = false;
      setScrubbing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      previewFromClientX(e.clientX);
    },
    [duration, previewFromClientX],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      previewFromClientX(e.clientX);
    },
    [scrubbing, previewFromClientX],
  );

  const endScrub = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    setScrubbing(false);
    const finalFrac = previewFromClientX(e.clientX);
    if (finalFrac !== null) {
      onSeek(finalFrac);
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (duration > 0) {
      pendingReleaseRef.current = true;
      pendingReleaseTimeoutRef.current = setTimeout(() => {
        clearPendingRelease();
      }, 500);
    } else {
      clearPendingRelease();
    }
  }, [scrubbing, previewFromClientX, onSeek, duration, clearPendingRelease]);

  return (
    <div className="w-full flex items-center gap-3 px-8 mb-4">
      <span
        className="shrink-0 w-9 text-right text-[11px] font-mono tabular-nums tracking-wide"
        style={{ color: "var(--music-text-muted)" }}
      >
        {fmt(displayTime)}
      </span>

      <div
        ref={trackRef}
        className="group/scrub relative flex-1 h-3 flex items-center cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={displayTime}
        aria-label="Seek"
      >
        <div
          className="relative w-full h-1 rounded-full transition-[height] duration-150 group-hover/scrub:h-1.5 group-active/scrub:h-1.5"
          style={{ background: "rgba(255,255,255,0.18)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
            style={{ width: `${pct}%`, background: "var(--music-accent)" }}
          />
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full pointer-events-none transition-all duration-150",
              scrubbing ? "w-3 h-3 opacity-100" : "w-2.5 h-2.5 opacity-0 group-hover/scrub:opacity-100",
            )}
            style={{
              left: `${pct}%`,
              background: "#fff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
            }}
          />
        </div>
      </div>

      <span
        className="shrink-0 w-9 text-[11px] font-mono tabular-nums tracking-wide"
        style={{ color: "var(--music-text-muted)" }}
      >
        {fmt(duration)}
      </span>
    </div>
  );
}

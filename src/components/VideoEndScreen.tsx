import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import type { MediaFile } from "../types";
import { VIDEO_END_SCREEN_COUNTDOWN_SEC } from "../videoEndScreenSuggestions";

type VideoEndScreenProps = {
  suggestions: MediaFile[];
  autoplayArmed: boolean;
  compact?: boolean;
  onSelect: (file: MediaFile) => void;
  onCancelTimer: () => void;
  onReplay: () => void;
};

function posterSrc(file: MediaFile): string | null {
  const path = file.thumbnailPath || file.ruforgePosterPath || file.embeddedCoverPath || null;
  return path ? convertFileSrc(path) : null;
}

function CountdownRing({
  secondsLeft,
  total,
  size,
}: {
  secondsLeft: number;
  total: number;
  size: number;
}) {
  const stroke = Math.max(2, Math.round(size / 16));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? secondsLeft / total : 0;
  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        className="transition-[stroke-dashoffset] duration-1000 linear"
      />
    </svg>
  );
}

export function VideoEndScreen({
  suggestions,
  autoplayArmed,
  compact = false,
  onSelect,
  onCancelTimer,
  onReplay,
}: VideoEndScreenProps) {
  const [secondsLeft, setSecondsLeft] = useState(
    autoplayArmed ? VIDEO_END_SCREEN_COUNTDOWN_SEC : 0,
  );
  const firedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  const primary = suggestions[0] ?? null;
  const primaryPath = primary?.path ?? null;

  useEffect(() => {
    firedRef.current = false;
    if (!autoplayArmed || !primaryPath) {
      setSecondsLeft(0);
      return;
    }
    setSecondsLeft(VIDEO_END_SCREEN_COUNTDOWN_SEC);
    const started = Date.now();
    const totalMs = VIDEO_END_SCREEN_COUNTDOWN_SEC * 1000;
    const tick = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((totalMs - (Date.now() - started)) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        window.clearInterval(tick);
        const next = suggestionsRef.current.find((f) => f.path === primaryPath);
        if (next) onSelectRef.current(next);
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [autoplayArmed, primaryPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancelTimer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancelTimer]);

  if (suggestions.length === 0) return null;

  const tileW = compact ? "w-[42vw] max-w-[160px]" : "w-[min(42vw,280px)]";
  const gap = compact ? "gap-3" : "gap-6";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-[54] flex flex-col items-center justify-center pointer-events-auto"
      role="dialog"
      aria-label="Up next"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelTimer();
      }}
    >
      <div className="absolute inset-0 bg-black/70" aria-hidden />

      <div
        className={`relative z-10 flex flex-col items-center ${compact ? "px-3 gap-3" : "px-6 gap-5"}`}
      >
        <div className={`flex items-stretch justify-center ${gap}`}>
          {suggestions.map((file, index) => {
            const isPrimary = index === 0;
            const thumb = posterSrc(file);
            const showCountdown = isPrimary && autoplayArmed && secondsLeft > 0;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelect(file)}
                className={`${tileW} group text-left rounded-xl overflow-hidden border border-white/15 bg-[#1a1412]/95 shadow-2xl hover:border-[color:var(--accent)]/50 hover:scale-[1.02] active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
              >
                <div
                  className={`relative w-full bg-black/40 ${compact ? "aspect-video" : "aspect-video"}`}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs font-black tracking-widest uppercase">
                      No art
                    </div>
                  )}
                  {showCountdown && (
                    <div
                      className={`absolute ${compact ? "top-1.5 right-1.5" : "top-2.5 right-2.5"} flex items-center justify-center`}
                      style={{
                        width: compact ? 28 : 36,
                        height: compact ? 28 : 36,
                      }}
                    >
                      <CountdownRing
                        secondsLeft={secondsLeft}
                        total={VIDEO_END_SCREEN_COUNTDOWN_SEC}
                        size={compact ? 28 : 36}
                      />
                      <span className="relative z-10 text-[10px] font-black text-white tabular-nums">
                        {secondsLeft}
                      </span>
                    </div>
                  )}
                  {isPrimary && (
                    <div
                      className={`absolute left-0 right-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}
                    >
                      <span
                        className={`font-black tracking-widest uppercase text-[color:var(--accent)] ${compact ? "text-[8px]" : "text-[10px]"}`}
                      >
                        Up next
                      </span>
                    </div>
                  )}
                </div>
                <div className={compact ? "px-2 py-1.5" : "px-3 py-2.5"}>
                  <p
                    className={`text-white font-semibold leading-snug line-clamp-2 ${compact ? "text-[11px]" : "text-sm"}`}
                  >
                    {file.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
          {autoplayArmed && (
            <button
              type="button"
              onClick={onCancelTimer}
              className={`rounded-lg border border-white/15 bg-black/50 text-white/85 hover:bg-white/10 hover:text-white transition-colors font-black tracking-widest uppercase ${compact ? "px-2.5 py-1 text-[9px]" : "px-3.5 py-1.5 text-[10px]"}`}
            >
              Cancel timer
            </button>
          )}
          <button
            type="button"
            onClick={onReplay}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 text-white/85 hover:bg-white/10 hover:text-white transition-colors font-black tracking-widest uppercase ${compact ? "px-2.5 py-1 text-[9px]" : "px-3.5 py-1.5 text-[10px]"}`}
          >
            <RotateCcw className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
            Replay
          </button>
        </div>
      </div>
    </motion.div>
  );
}

import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import type { MediaFile } from "../types";
import { VIDEO_END_SCREEN_COUNTDOWN_SEC } from "../videoEndScreenSuggestions";

export type VideoEndScreenPhase = "cards" | "ended";

type VideoEndScreenProps = {
  phase: VideoEndScreenPhase;
  suggestions: MediaFile[];
  autoplayArmed: boolean;
  compact?: boolean;
  onSelect: (file: MediaFile) => void;
  onCancelTimer: () => void;
  onPlayNow: () => void;
  onCardHoverChange?: (hovered: boolean) => void;
};

function posterSrc(file: MediaFile): string | null {
  const path = file.thumbnailPath || file.ruforgePosterPath || file.embeddedCoverPath || null;
  return path ? convertFileSrc(path) : null;
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function EndCardTile({
  file,
  compact,
  lifted,
  onSelect,
  onHoverChange,
}: {
  file: MediaFile;
  compact: boolean;
  lifted?: boolean;
  onSelect: () => void;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const thumb = posterSrc(file);
  const durationLabel = formatDuration(file.duration);
  const tileW = compact ? "w-[36vw] max-w-[140px]" : "w-[min(28vw,220px)]";

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      className={`${tileW} group text-left rounded-xl overflow-hidden border border-white/20 bg-black/55 backdrop-blur-md shadow-xl transition-transform duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        lifted
          ? "-translate-y-3 scale-[1.04] shadow-2xl border-white/35 z-10"
          : "hover:-translate-y-3 hover:scale-[1.04] hover:shadow-2xl hover:border-white/35 hover:z-10"
      }`}
    >
      <div className="relative w-full aspect-video bg-black/40">
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
        {durationLabel && (
          <span
            className={`absolute bottom-1.5 right-1.5 rounded bg-black/80 text-white font-semibold tabular-nums ${
              compact ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[10px]"
            }`}
          >
            {durationLabel}
          </span>
        )}
      </div>
      <div className={compact ? "px-2 py-1.5" : "px-2.5 py-2"}>
        <p
          className={`text-white font-semibold leading-snug line-clamp-2 ${
            compact ? "text-[10px]" : "text-xs"
          }`}
        >
          {file.name}
        </p>
      </div>
    </button>
  );
}

function CardsPhase({
  suggestions,
  compact,
  onSelect,
  onCardHoverChange,
}: {
  suggestions: MediaFile[];
  compact: boolean;
  onSelect: (file: MediaFile) => void;
  onCardHoverChange?: (hovered: boolean) => void;
}) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const gap = compact ? "gap-4" : "gap-10";

  const setHover = (path: string | null) => {
    setHoveredPath(path);
    onCardHoverChange?.(path != null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-[54] flex items-center justify-center pointer-events-none"
      aria-label="Suggested videos"
    >
      <div
        className={`relative z-10 flex items-center justify-center pointer-events-auto ${gap} ${
          compact ? "px-3" : "px-8"
        }`}
      >
        {suggestions.map((file) => (
          <EndCardTile
            key={file.path}
            file={file}
            compact={compact}
            lifted={hoveredPath === file.path}
            onSelect={() => onSelect(file)}
            onHoverChange={(hovered) => setHover(hovered ? file.path : null)}
          />
        ))}
      </div>
    </motion.div>
  );
}

function EndedPhase({
  suggestions,
  autoplayArmed,
  compact,
  onSelect,
  onCancelTimer,
  onPlayNow,
}: {
  suggestions: MediaFile[];
  autoplayArmed: boolean;
  compact: boolean;
  onSelect: (file: MediaFile) => void;
  onCancelTimer: () => void;
  onPlayNow: () => void;
}) {
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
  const thumb = primary ? posterSrc(primary) : null;
  const durationLabel = primary ? formatDuration(primary.duration) : null;
  const tileW = compact ? "w-[56vw] max-w-[200px]" : "w-[min(48vw,320px)]";

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

  if (!primary) return null;

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
      <div className="absolute inset-0 bg-black" aria-hidden />

      <div
        className={`relative z-10 flex flex-col items-center ${
          compact ? "px-3 gap-2.5" : "px-6 gap-4"
        }`}
      >
        {autoplayArmed && secondsLeft > 0 ? (
          <p
            className={`text-white/90 font-semibold tracking-wide ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            Up next in {secondsLeft}
          </p>
        ) : (
          <p
            className={`text-white/70 font-semibold tracking-wide ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            Up next
          </p>
        )}

        <button
          type="button"
          onClick={() => onSelect(primary)}
          className={`${tileW} text-left rounded-xl overflow-hidden border border-white/15 bg-[#1a1412]/95 shadow-2xl hover:border-[color:var(--accent)]/50 hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
        >
          <div className="relative w-full aspect-video bg-black/40">
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
            {durationLabel && (
              <span
                className={`absolute bottom-1.5 right-1.5 rounded bg-black/80 text-white font-semibold tabular-nums ${
                  compact ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[10px]"
                }`}
              >
                {durationLabel}
              </span>
            )}
          </div>
          <div className={compact ? "px-2 py-1.5" : "px-3 py-2.5"}>
            <p
              className={`text-white font-semibold leading-snug line-clamp-2 ${
                compact ? "text-[11px]" : "text-sm"
              }`}
            >
              {primary.name}
            </p>
          </div>
        </button>

        <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
          <button
            type="button"
            onClick={onCancelTimer}
            className={`rounded-full border border-white/20 bg-black/60 text-white/90 hover:bg-white/10 hover:text-white transition-colors font-semibold tracking-wide uppercase ${
              compact ? "px-3 py-1 text-[9px]" : "px-4 py-1.5 text-[11px]"
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onPlayNow}
            className={`rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 transition-colors font-semibold tracking-wide uppercase ${
              compact ? "px-3 py-1 text-[9px]" : "px-4 py-1.5 text-[11px]"
            }`}
          >
            Play now
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function VideoEndScreen({
  phase,
  suggestions,
  autoplayArmed,
  compact = false,
  onSelect,
  onCancelTimer,
  onPlayNow,
  onCardHoverChange,
}: VideoEndScreenProps) {
  if (suggestions.length === 0) return null;

  if (phase === "cards") {
    return (
      <CardsPhase
        suggestions={suggestions}
        compact={compact}
        onSelect={onSelect}
        onCardHoverChange={onCardHoverChange}
      />
    );
  }

  return (
    <EndedPhase
      suggestions={suggestions}
      autoplayArmed={autoplayArmed}
      compact={compact}
      onSelect={onSelect}
      onCancelTimer={onCancelTimer}
      onPlayNow={onPlayNow}
    />
  );
}

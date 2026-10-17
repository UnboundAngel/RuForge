import { useEffect, useRef, useState } from "react";
import { localImageSrc } from "@/lib/localImageSrc";
import { motion } from "motion/react";
import { EyeOff } from "lucide-react";
import type { MediaFile } from "../types";
import { VIDEO_END_SCREEN_COUNTDOWN_SEC } from "../videoEndScreenSuggestions";
import { ChannelAvatar } from "./library/VideoByline";

export type VideoEndScreenPhase = "cards" | "ended";

export type VideoEndScreenCreator = { channelId: string; channel: string };

type VideoEndScreenProps = {
  phase: VideoEndScreenPhase;
  suggestions: MediaFile[];
  autoplayArmed: boolean;
  compact?: boolean;
  creator?: VideoEndScreenCreator | null;
  onOpenCreator?: (creator: VideoEndScreenCreator) => void;
  onSelect: (file: MediaFile) => void;
  onCancelTimer: () => void;
  onPlayNow: () => void;
  onCardHoverChange?: (hovered: boolean) => void;
  onHide?: () => void;
};

function posterSrc(file: MediaFile): string | null {
  const path = file.thumbnailPath || file.ruforgePosterPath || file.embeddedCoverPath || null;
  return path ? localImageSrc(path) : null;
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

/** Positions on a 16:9 stage, YouTube's diagonal: first card top left, creator under it, second card lower right. */
const CARD_SLOTS = [
  { left: "6%", top: "4%" },
  { left: "52%", top: "52%" },
] as const;

const STAGE_ENTER = { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 } };

function EndCardTile({
  file,
  dimmed,
  onSelect,
  onHoverChange,
}: {
  file: MediaFile;
  dimmed: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const thumb = posterSrc(file);
  const durationLabel = formatDuration(file.duration);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      className="group/card relative block w-full aspect-video overflow-hidden rounded-[1.6cqw] bg-black/60 text-left transition-transform duration-150 ease-out hover:scale-[1.03] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {thumb ? (
        <img src={thumb} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[clamp(9px,1cqw,12px)] font-black uppercase tracking-widest text-white/30">
          No art
        </div>
      )}
      <div className="absolute inset-x-0 top-0 h-3/5 bg-gradient-to-b from-black/75 via-black/30 to-transparent" aria-hidden />
      <div
        className={`absolute inset-0 bg-black/65 transition-opacity duration-150 ease-out ${dimmed ? "opacity-100" : "opacity-0"}`}
        aria-hidden
      />
      <p className="absolute inset-x-0 top-0 line-clamp-2 px-[1.4cqw] pt-[1.1cqw] text-[clamp(12px,1.75cqw,20px)] font-semibold leading-snug text-white">
        {file.name}
      </p>
      {durationLabel && (
        <span className="absolute bottom-[0.9cqw] right-[0.9cqw] rounded-md bg-black/80 px-[0.6cqw] py-[0.2cqw] text-[clamp(10px,1.2cqw,14px)] font-semibold tabular-nums text-white">
          {durationLabel}
        </span>
      )}
    </button>
  );
}

/** Hover grows a light squircle out from behind the avatar; clicking anywhere on it opens the creator's page. */
function CreatorTile({
  creator,
  dimmed,
  onOpen,
}: {
  creator: VideoEndScreenCreator;
  dimmed: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${creator.channel}'s page`}
      className="group/creator relative block aspect-square w-full rounded-full text-left focus:outline-none"
    >
      <span
        aria-hidden
        className="absolute -left-[1.6cqw] -top-[1.6cqw] flex h-[19.2cqw] items-center whitespace-nowrap bg-stone-50 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[clip-path,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] [clip-path:inset(0_calc(100%_-_19.2cqw)_0_0_round_9.6cqw)] group-hover/creator:opacity-100 group-hover/creator:[clip-path:inset(0_0_0_0_round_3.2cqw)] group-focus-visible/creator:opacity-100 group-focus-visible/creator:[clip-path:inset(0_0_0_0_round_3.2cqw)]"
      >
        <span className="h-full aspect-square shrink-0" />
        <span className="flex flex-col pl-[1.6cqw] pr-[3cqw]">
          <span className="text-[clamp(13px,2.2cqw,26px)] font-bold leading-tight tracking-tight text-stone-900">
            {creator.channel}
          </span>
          <span className="mt-[0.4cqw] text-[clamp(10px,1.25cqw,15px)] font-semibold text-stone-500">
            View channel
          </span>
        </span>
      </span>
      <span className="relative z-10 block h-full w-full">
        <ChannelAvatar
          channelId={creator.channelId}
          channel={creator.channel}
          className="h-full w-full text-[6cqw]!"
        />
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full bg-black/65 transition-opacity duration-150 ease-out ${dimmed ? "opacity-100" : "opacity-0"}`}
        />
      </span>
    </button>
  );
}

function CardsPhase({
  suggestions,
  compact,
  creator,
  onOpenCreator,
  onSelect,
  onCardHoverChange,
  onHide,
}: {
  suggestions: MediaFile[];
  compact: boolean;
  creator: VideoEndScreenCreator | null;
  onOpenCreator?: (creator: VideoEndScreenCreator) => void;
  onSelect: (file: MediaFile) => void;
  onCardHoverChange?: (hovered: boolean) => void;
  onHide?: () => void;
}) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const setHover = (path: string | null) => {
    setHoveredPath(path);
    onCardHoverChange?.(path != null);
  };

  const dimmedUnless = (path: string | null) => hoveredPath != null && hoveredPath !== path;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-[54] pointer-events-none"
      aria-label="Suggested videos"
    >
      <div
        className={`absolute flex items-center justify-center [container-type:size] ${
          compact ? "inset-x-[4%] top-[12%] bottom-[60px]" : "inset-x-[5%] top-[8%] bottom-[112px]"
        }`}
      >
        <div className="relative aspect-video w-[min(100cqw,calc(100cqh*16/9))] [container-type:inline-size]">
          {suggestions.slice(0, CARD_SLOTS.length).map((file, i) => (
            <motion.div
              key={file.path}
              {...STAGE_ENTER}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
              className="pointer-events-auto absolute w-[40%]"
              style={CARD_SLOTS[i]}
            >
              <EndCardTile
                file={file}
                dimmed={dimmedUnless(file.path)}
                onSelect={() => onSelect(file)}
                onHoverChange={(hovered) =>
                  setHover(hovered ? file.path : hoveredPath === file.path ? null : hoveredPath)
                }
              />
            </motion.div>
          ))}
          {creator && onOpenCreator && (
            <motion.div
              {...STAGE_ENTER}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="pointer-events-auto absolute left-[18%] top-[54%] w-[16%]"
            >
              <CreatorTile creator={creator} dimmed={dimmedUnless(null)} onOpen={() => onOpenCreator(creator)} />
            </motion.div>
          )}
        </div>
      </div>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className={`pointer-events-auto absolute flex items-center gap-1.5 rounded-full bg-black/70 px-3 font-semibold text-white/90 transition-[background-color,transform] duration-150 hover:bg-black/90 hover:text-white active:scale-95 ${
            compact ? "right-3 top-14 h-6 text-[11px]" : "right-8 top-6 h-7 text-[12px]"
          }`}
        >
          <EyeOff className="h-3.5 w-3.5" />
          Hide
        </button>
      )}
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
  const tileW = compact ? "w-[56vw] max-w-[240px]" : "w-[min(34vw,300px)]";

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

  const btnPad = compact ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-[12px]";

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

      <div className={`relative z-10 ${tileW}`}>
        {autoplayArmed && secondsLeft > 0 ? (
          <p
            className={`text-left text-white font-medium mb-1.5 ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            Up next in {secondsLeft}
          </p>
        ) : (
          <p
            className={`text-left text-white/80 font-medium mb-1.5 ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            Up next
          </p>
        )}

        <button
          type="button"
          onClick={() => onSelect(primary)}
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-xl"
        >
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/40">
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
                className={`absolute bottom-1.5 right-1.5 rounded bg-black/85 text-white font-semibold tabular-nums ${
                  compact ? "px-1 py-0.5 text-[8px]" : "px-1.5 py-0.5 text-[10px]"
                }`}
              >
                {durationLabel}
              </span>
            )}
          </div>
          <p
            className={`text-left text-white font-medium leading-snug line-clamp-2 mt-2 ${
              compact ? "text-[12px]" : "text-[15px]"
            }`}
          >
            {primary.name}
          </p>
        </button>

        <div className={`flex w-full items-stretch ${compact ? "gap-2 mt-3" : "gap-2.5 mt-3.5"}`}>
          <button
            type="button"
            onClick={onCancelTimer}
            className={`flex-1 rounded-full bg-[#272727] text-white hover:bg-[#3a3a3a] transition-colors font-medium tracking-wide uppercase ${btnPad}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onPlayNow}
            className={`flex-1 rounded-full bg-[#3f3f3f] text-white hover:bg-[#525252] transition-colors font-medium tracking-wide uppercase ${btnPad}`}
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
  creator = null,
  onOpenCreator,
  onSelect,
  onCancelTimer,
  onPlayNow,
  onCardHoverChange,
  onHide,
}: VideoEndScreenProps) {
  if (suggestions.length === 0) return null;

  if (phase === "cards") {
    return (
      <CardsPhase
        suggestions={suggestions}
        compact={compact}
        creator={creator}
        onOpenCreator={onOpenCreator}
        onSelect={onSelect}
        onCardHoverChange={onCardHoverChange}
        onHide={onHide}
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

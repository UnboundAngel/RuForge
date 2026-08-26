import { motion } from "motion/react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const ICON_W_PX = 28;
const SLIDER_W_PX = 52;
const SLIDER_GAP_PX = 4;
/** Reserved in grid col 1 so scaleX slider never overlaps prev-track column. */
export const ISLAND_VOLUME_SLOT_W_PX = ICON_W_PX + SLIDER_GAP_PX + SLIDER_W_PX;

type Props = {
  volume: number;
  isMuted: boolean;
  onVolume: (v: number) => void;
  onMuted: (m: boolean) => void;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function IslandVolumeControl({ volume, isMuted, onVolume, onMuted }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);

  const showSlider = hovering || dragging;
  const displayLevel = isMuted ? 0 : volume;
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const toggleMute = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onMuted(!isMuted);
    },
    [isMuted, onMuted],
  );

  const handleAuxMute = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      toggleMute(e);
    },
    [toggleMute],
  );

  const seekToClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const frac = clamp01((clientX - rect.left) / rect.width);
      onVolume(frac);
      if (isMuted && frac > 0) onMuted(false);
    },
    [isMuted, onMuted, onVolume],
  );

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      setDragging(true);
      seekToClientX(e.clientX);
      const onMove = (ev: MouseEvent) => {
        if (draggingRef.current) seekToClientX(ev.clientX);
      };
      const onUp = (ev: MouseEvent) => {
        draggingRef.current = false;
        setDragging(false);
        seekToClientX(ev.clientX);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [seekToClientX],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!hovering && !draggingRef.current) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY > 0 && isMuted) return;
      if (e.deltaY > 0 && volume <= 0.02 && !isMuted) {
        onMuted(true);
        return;
      }
      const stepMag = volume < 0.25 ? 0.02 : 0.05;
      const step = e.deltaY > 0 ? -stepMag : stepMag;
      const next = clamp01(volume + step);
      onVolume(next);
      if (isMuted && next > 0) onMuted(false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hovering, volume, isMuted, onVolume, onMuted]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto relative h-7 shrink-0"
      style={{ width: ISLAND_VOLUME_SLOT_W_PX }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        if (!draggingRef.current) setHovering(false);
      }}
      onMouseDown={handleAuxMute}
    >
      <button
        type="button"
        className={`pointer-events-auto absolute left-0 top-0 flex h-7 w-7 items-center justify-center transition-colors active:scale-[0.97] ${
          isMuted
            ? "text-red-500 hover:text-red-400"
            : "text-zinc-300 hover:text-white"
        }`}
        aria-label={isMuted ? "Unmute" : "Mute"}
        onClick={toggleMute}
        onMouseDown={handleAuxMute}
      >
        <VolumeIcon className="pointer-events-none h-4 w-4" strokeWidth={2} />
      </button>

      <motion.div
        className="absolute top-1/2 origin-left -translate-y-1/2"
        style={{
          left: ICON_W_PX + SLIDER_GAP_PX,
          width: SLIDER_W_PX,
          pointerEvents: showSlider ? "auto" : "none",
        }}
        initial={false}
        animate={{
          scaleX: showSlider ? 1 : 0,
          opacity: showSlider ? 1 : 0,
        }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          ref={trackRef}
          className="relative h-4 w-full cursor-pointer"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(displayLevel * 100)}
          aria-label="Volume"
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              toggleMute(e);
              return;
            }
            handleTrackMouseDown(e);
          }}
        >
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-zinc-700" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white pointer-events-none"
            style={{ width: `${displayLevel * 100}%` }}
          />
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-zinc-900 pointer-events-none"
            style={{ left: `${displayLevel * 100}%` }}
          />
        </div>
      </motion.div>
    </div>
  );
}

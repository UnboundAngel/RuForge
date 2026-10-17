import { motion } from "motion/react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/Slider";

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

  const setLevel = useCallback(
    (frac: number) => {
      onVolume(frac);
      if (isMuted && frac > 0) onMuted(false);
    },
    [isMuted, onMuted, onVolume],
  );

  const onDragChange = useCallback((next: boolean) => {
    draggingRef.current = next;
    setDragging(next);
  }, []);

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
        <Slider
          label="Volume"
          level={displayLevel}
          onChange={setLevel}
          onDragChange={onDragChange}
          onMiddleClick={() => onMuted(!isMuted)}
          thumbFill="var(--rf-island-shell)"
          className="w-full"
        />
      </motion.div>
    </div>
  );
}

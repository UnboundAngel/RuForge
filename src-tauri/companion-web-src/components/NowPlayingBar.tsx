import { useRef, type RefObject } from "react";
import { AnimatePresence, m, type PanInfo } from "motion/react";
import { Art } from "./Cards";
import { PlayPauseMorphIcon } from "./icons";
import { PRESS_SPRING, overlayPanelTransition, pageTransition } from "../motion";
import { useClock } from "../playbackClock";
import { itemMediaType, type CompanionItem } from "../types";

const SWIPE_PX = 56;
const SWIPE_VELOCITY = 400;

type Props = {
  item: CompanionItem;
  paused: boolean;
  duration: number;
  hasNext: boolean;
  direction: number;
  onOpen: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  /** The full player grows out of this card and collapses back into it. */
  cardRef: RefObject<HTMLDivElement | null>;
};

export function NowPlayingBar({ item, paused, duration, hasNext, direction, onOpen, onTogglePlay, onNext, onPrev, cardRef }: Props) {
  const swiped = useRef(false);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if ((offset.x < -SWIPE_PX || velocity.x < -SWIPE_VELOCITY) && hasNext) onNext();
    else if (offset.x > SWIPE_PX || velocity.x > SWIPE_VELOCITY) onPrev();
  };

  return (
    <m.div
      ref={cardRef}
      className="ph-mini"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={overlayPanelTransition}
    >
      <m.button
        type="button"
        className="ph-mini-open"
        aria-label={`Open player: ${item.title}`}
        drag="x"
        dragSnapToOrigin
        dragElastic={0.35}
        dragConstraints={{ left: 0, right: 0 }}
        onPointerDownCapture={() => { swiped.current = false; }}
        onDragStart={() => { swiped.current = true; }}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (!swiped.current) onOpen();
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <m.span
            key={item.id}
            className="ph-mini-now"
            initial={{ opacity: 0, x: direction * 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -48 }}
            transition={pageTransition}
          >
            <Art item={item} className={`ph-mini-art${itemMediaType(item) === "video" ? " ph-mini-art--video" : ""}`} iconSize={18} />
            <span className="ph-mini-text">
              <span className="ph-mini-title">{item.title}</span>
              {item.artist ? <span className="ph-mini-artist">{item.artist}</span> : null}
            </span>
          </m.span>
        </AnimatePresence>
      </m.button>
      <m.button
        type="button"
        className="ph-icon-btn ph-mini-play"
        onClick={onTogglePlay}
        aria-label={paused ? "Play" : "Pause"}
        whileTap={{ scale: 0.88 }}
        transition={PRESS_SPRING}
      >
        <PlayPauseMorphIcon playing={!paused} size={24} />
      </m.button>
      <span className="ph-mini-progress" aria-hidden>
        <MiniProgressFill duration={duration} />
      </span>
    </m.div>
  );
}

function MiniProgressFill({ duration }: { duration: number }) {
  const t = useClock();
  const progress = duration > 0 ? Math.min(1, t / duration) : 0;
  return <span className="ph-mini-progress-fill" style={{ transform: `scaleX(${progress})` }} />;
}

import { useEffect, useRef } from "react";
import { m, useDragControls, type PanInfo } from "motion/react";
import { TrackRow } from "./TrackRow";
import { X } from "./icons";
import { SHEET_CLOSE_PX, SHEET_CLOSE_VELOCITY, SHEET_TRANSITION, overlayFadeTransition } from "../motion";
import type { CompanionItem } from "../types";

type Props = {
  open: boolean;
  playlist: CompanionItem[];
  activeId: string | null;
  onPlay: (item: CompanionItem) => void;
  onClose: () => void;
};

export function QueueSheet({ open, playlist, activeId, onPlay, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  const idx = playlist.findIndex((i) => i.id === activeId);
  const upNext = idx >= 0 ? playlist.slice(idx + 1) : playlist;
  const current = idx >= 0 ? playlist[idx] : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > SHEET_CLOSE_PX || info.velocity.y > SHEET_CLOSE_VELOCITY) onClose();
  };

  return (
    <div ref={ref} className={`ph-queue${open ? " ph-queue--open" : ""}`} aria-hidden={!open}>
      <m.button
        type="button"
        className="ph-queue-scrim"
        onClick={onClose}
        aria-label="Close up next"
        tabIndex={-1}
        initial={false}
        animate={{ opacity: open ? 0.6 : 0 }}
        transition={overlayFadeTransition}
      />
      <m.div
        className="ph-queue-panel"
        role="dialog"
        aria-label="Up next"
        initial={false}
        animate={{ y: open ? 0 : "100%" }}
        transition={SHEET_TRANSITION}
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={onDragEnd}
      >
        <div
          className="ph-queue-head"
          onPointerDown={(e) => {
            if (!(e.target as Element).closest("button")) drag.start(e);
          }}
        >
          <span className="ph-grabber" aria-hidden />
          <h2 className="ph-queue-title">Up next</h2>
          <button type="button" className="ph-icon-btn ph-icon-btn--tonal" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.25} />
          </button>
        </div>
        <div className="ph-queue-scroll">
          {current ? (
            <>
              <h3 className="ph-section-label">Now playing</h3>
              <TrackRow item={current} active playable onPlay={() => onPlay(current)} />
            </>
          ) : null}
          <h3 className="ph-section-label">Next</h3>
          {upNext.length > 0 ? (
            <div className="ph-list">
              {upNext.map((item) => (
                <TrackRow key={item.id} item={item} active={false} playable onPlay={() => onPlay(item)} />
              ))}
            </div>
          ) : (
            <p className="ph-empty">Nothing after this one.</p>
          )}
        </div>
      </m.div>
    </div>
  );
}

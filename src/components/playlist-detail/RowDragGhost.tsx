import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { GripVertical, Play } from "lucide-react";
import type { MediaFile } from "@/types";
import { localImageSrc } from "@/lib/localImageSrc";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { OVERLAY_EASE, overlayPanelTransition } from "@/lib/overlayMotion";
import { PlaylistRowMeta } from "./PlaylistRowMeta";
import { rowTitle } from "./playlistRows";
import type { GhostView } from "./useRowDrag";

const EASE = `cubic-bezier(${OVERLAY_EASE.join(",")})`;
const MS = Math.round(overlayPanelTransition.duration * 1000);
/** Cover-state size: the row's thumbnail, a little larger. */
const COVER_W = 176;
const COVER_H = 99;
const EDGE_GAP = 8;

/**
 * The dragged row. In the list it is the row itself (same box, grip, thumbnail, title, channel).
 * Over the cover it morphs into just its thumbnail, a little larger and centred on the pointer, to
 * say it becomes the start video; leaving the cover morphs it back. Portaled and fixed so the list
 * pane cannot clip it and it can reach the cover.
 */
export function RowDragGhost({ ghost, file }: { ghost: GhostView; file: MediaFile }) {
  const reduce = useReducedMotion();
  const thumb = file.thumbnailPath || file.ruforgePosterPath;
  const settling = ghost.settleY !== undefined;
  const { rect } = ghost;
  const cover = ghost.overCover;

  // The pointer is followed without easing; only the toggle between the two shapes eases.
  // Flagged in the same render as the toggle, so the first frame already eases instead of jumping.
  const [morphing, setMorphing] = useState(false);
  const [shownCover, setShownCover] = useState(cover);
  if (shownCover !== cover) {
    setShownCover(cover);
    setMorphing(true);
  }
  useEffect(() => {
    if (!morphing) return;
    const t = window.setTimeout(() => setMorphing(false), MS);
    return () => window.clearTimeout(t);
  }, [morphing, cover]);

  const width = cover ? COVER_W : rect.width;
  const height = cover ? COVER_H : rect.height;
  const rowX = Math.max(-rect.left + EDGE_GAP, Math.min(ghost.x, window.innerWidth - EDGE_GAP - rect.left - rect.width));
  const x = cover ? ghost.px - COVER_W / 2 - rect.left : rowX;
  const y = settling ? ghost.settleY : cover ? ghost.py - COVER_H / 2 - rect.top : ghost.y;
  const ease = reduce ? "none" : undefined;
  const t = (prop: string) => (ease ? "none" : `${prop} ${MS}ms ${EASE}`);
  const transition = [
    t("width"),
    t("height"),
    t("border-radius"),
    t("background-color"),
    t("box-shadow"),
    settling ? `transform 180ms ${EASE}` : morphing ? t("transform") : "",
  ]
    .filter((p) => p && p !== "none")
    .join(", ");

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.top,
        width,
        height,
        transform: `translate(${x}px, ${y}px)`,
        transition: transition || "none",
      }}
      className={`pointer-events-none z-[200] overflow-hidden ${
        cover
          ? "rounded-xl bg-transparent shadow-[0_14px_32px_rgba(0,0,0,0.55)]"
          : "rounded-xl bg-[color:var(--rf-field-raised)] shadow-[0_14px_32px_rgba(0,0,0,0)]"
      }`}
    >
      <div
        style={{ opacity: cover ? 0 : 1, transition: t("opacity") }}
        className="absolute inset-0 grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 px-2 py-1.5"
      >
        <div className="flex h-8 w-10 items-center justify-center">
          <GripVertical size={18} className="text-stone-300" />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-28 flex-shrink-0 min-[1400px]:w-32">
            <div className="rf-art-clip relative aspect-video border border-white/5 bg-stone-900">
              {thumb ? (
                <img src={localImageSrc(thumb)} alt="" draggable={false} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Play size={20} className="text-stone-800" />
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-bold text-stone-100">{rowTitle(file.name)}</h3>
            <PlaylistRowMeta file={file} watched={false} isStart={false} />
          </div>
        </div>
        <span className="pr-12 font-mono text-[13px] tabular-nums text-stone-400">{formatDuration(file.duration)}</span>
      </div>
      <div data-drag-thumb style={{ opacity: cover ? 1 : 0, transition: t("opacity") }} className="absolute inset-0 bg-stone-900">
        {thumb ? <img src={localImageSrc(thumb)} alt="" draggable={false} className="h-full w-full object-cover" /> : null}
      </div>
    </div>,
    document.body,
  );
}

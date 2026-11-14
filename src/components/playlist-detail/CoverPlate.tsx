import { forwardRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Flag } from "lucide-react";
import { localImageSrc } from "@/lib/localImageSrc";
import { PlaylistEmptyThumb } from "@/components/PlaylistEmptyThumb";
import { motionDuration, overlayFadeTransition, overlayPanelTransition } from "@/lib/overlayMotion";

export type UpNext = { label: string; title: string; duration: string };

type Props = {
  cover?: string;
  /** A row is being dragged anywhere on the page. */
  dragging: boolean;
  /** The dragged row is over the plate. */
  armed: boolean;
  /** Title of the dragged row. */
  dragTitle?: string;
  upNext: UpNext | null;
  onPlay: () => void;
};

/**
 * The art, bleeding off the right edge of the hero. It starts below the app's top-right chrome so
 * the search and trash pill never sits on it. It is also the drop target for "set as start video":
 * while a row is dragged the art dims and says so, and over it the caption switches to a release line
 * confirm. Hovering otherwise says what a click will do instead of showing a play glyph.
 */
export const CoverPlate = forwardRef<HTMLDivElement, Props>(function CoverPlate(
  { cover, dragging, armed, dragTitle, upNext, onPlay },
  ref,
) {
  const [hot, setHot] = useState(false);
  const reduce = useReducedMotion();
  const hoverShow = hot && !dragging && upNext != null;
  const captionShow = dragging || hoverShow;
  const fade = motionDuration(reduce, overlayFadeTransition);

  return (
    <div
      ref={ref}
      onClick={onPlay}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      className="group absolute bottom-0 right-0 top-12 w-full cursor-pointer overflow-hidden [clip-path:inset(0_round_24px_0_0_0)] min-[900px]:w-[64%]"
    >
      {cover ? (
        <AnimatePresence initial={false}>
          <motion.div
            key={cover}
            exit={{ opacity: 0, transition: overlayPanelTransition }}
            className="absolute inset-0 [mask-image:linear-gradient(to_right,transparent,#000_40%)]"
          >
            <div className="h-full w-full [mask-image:linear-gradient(to_bottom,transparent,#000_65%)]">
              <img
                src={localImageSrc(cover)}
                alt=""
                draggable={false}
                className="h-full w-full object-cover object-[50%_30%]"
              />
            </div>
          </motion.div>
        </AnimatePresence>
      ) : (
        <PlaylistEmptyThumb />
      )}
      <motion.div
        initial={false}
        animate={{ opacity: dragging ? (armed ? 0.25 : 0.55) : 0 }}
        transition={fade}
        className="pointer-events-none absolute inset-0 bg-black"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--rf-well)] via-[color:var(--rf-well)]/60 via-30% to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[color:var(--rf-well)] to-transparent" />
      <motion.div
        initial={false}
        animate={{ opacity: captionShow ? 1 : 0, y: captionShow ? 0 : 10 }}
        transition={motionDuration(reduce, overlayPanelTransition)}
        className="pointer-events-none absolute bottom-8 right-8 max-w-[360px] text-right"
      >
        {dragging ? (
          <>
            <p className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
              <Flag size={12} strokeWidth={2.5} />
              {armed ? "Release to set" : "Drop to set"}
            </p>
            <p className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug text-white">Start video</p>
            {dragTitle ? <p className="mt-0.5 line-clamp-1 text-xs font-medium text-white/70">{dragTitle}</p> : null}
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">{upNext?.label}</p>
            <p className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug text-white">{upNext?.title}</p>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-white/70">{upNext?.duration}</p>
          </>
        )}
      </motion.div>
    </div>
  );
});

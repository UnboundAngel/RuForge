import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { animate, motion } from "motion/react";
import { localImageSrc } from "@/lib/localImageSrc";
import { overlayPanelTransition, overlaySettleTransition } from "@/lib/overlayMotion";

export type FlyState = {
  src: string;
  from: DOMRect;
  to: { left: number; top: number; width: number; height: number };
  /** Lands on the hero cover plate: it carries the plate's mask and scrims so the hand-off to the real cover is identical. */
  plate?: boolean;
  /** Re-read every frame so the landing follows a slot that scrolls or moves while the cover flies. */
  track?: () => FlyState["to"] | null;
};

const MASK_LEFT = "[mask-image:linear-gradient(to_right,transparent,#000_40%)]";
const MASK_TOP = "[mask-image:linear-gradient(to_bottom,transparent,#000_65%)]";

/** The dropped card's cover grows from where it was released into the cover slot. */
export function CoverFly({ fly, onDone }: { fly: FlyState; onDone: () => void }) {
  const { from } = fly;
  const ref = useRef<HTMLDivElement>(null);
  const { to } = fly;
  const track = fly.track;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    let last = to;
    const controls = animate(0, 1, {
      ...overlaySettleTransition,
      onUpdate: (p) => {
        last = track() ?? last;
        el.style.left = `${from.left + (last.left - from.left) * p}px`;
        el.style.top = `${from.top + (last.top - from.top) * p}px`;
        el.style.width = `${from.width + (last.width - from.width) * p}px`;
        el.style.height = `${from.height + (last.height - from.height) * p}px`;
      },
      onComplete: onDone,
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const img = (
    <img src={localImageSrc(fly.src)} alt="" draggable={false} className={`h-full w-full object-cover ${fly.plate ? "object-[50%_30%]" : ""}`} />
  );
  return createPortal(
    <motion.div
      ref={ref}
      initial={{
        left: from.left,
        top: from.top,
        width: from.width,
        height: from.height,
        ...(fly.plate ? { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 } : null),
      }}
      animate={track ? undefined : {
        left: to.left,
        top: to.top,
        width: to.width,
        height: to.height,
        ...(fly.plate ? { borderTopLeftRadius: 0, borderTopRightRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null),
      }}
      transition={fly.plate ? overlayPanelTransition : overlaySettleTransition}
      onAnimationComplete={track ? undefined : onDone}
      style={{ position: "fixed" }}
      className={`pointer-events-none z-[200] ${fly.plate ? "overflow-hidden" : "rf-art-clip bg-stone-900"}`}
    >
      {fly.plate ? (
        <>
          {/* The masked art is always there; the plain thumbnail on top fades out so the mask arrives with the growth. */}
          <div className={`absolute inset-0 ${MASK_LEFT}`}>
            <div className={`h-full w-full ${MASK_TOP}`}>{img}</div>
          </div>
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={overlayPanelTransition}
            className="absolute inset-0 bg-stone-900"
          >
            {img}
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={overlayPanelTransition}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--rf-well)] via-[color:var(--rf-well)]/60 via-30% to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[color:var(--rf-well)] to-transparent" />
          </motion.div>
        </>
      ) : (
        img
      )}
    </motion.div>,
    document.body,
  );
}

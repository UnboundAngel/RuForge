import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { animate, usePresence, useReducedMotion } from "motion/react";
import { overlaySettleTransition } from "@/lib/overlayMotion";
import { claimIncoming, reverseExits } from "./addFlyRegistry";

const STEP = overlaySettleTransition.duration;
const SLOT = ".rf-art-clip";

function thumbRight(el: HTMLElement): number {
  const slot = el.querySelector(SLOT);
  return slot ? slot.getBoundingClientRect().right - el.getBoundingClientRect().left : 0;
}

/**
 * Rows opening and closing around their thumbnail: a row a shelf card flew into opens its height and
 * unfolds its text from the thumbnail during the flight; a row sent back folds into its thumbnail as it flies out.
 * Every other row mounts as before and closes its gap when removed.
 */
export function EnterRow({ rowKey, animate: animateIn, children }: { rowKey: string; animate: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // Fixed at mount: the flag flips on the page's first re-render, and rows already there must not reopen.
  const opens = useRef(animateIn);
  const [present, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !opens.current || reduce) return;
    const flying = claimIncoming(rowKey);
    const full = el.scrollHeight;
    const slot = el.querySelector<HTMLElement>(SLOT);
    el.style.overflow = "hidden";
    el.style.height = "0px";
    const opening = animate(el, { height: [0, full], opacity: [0, 1] }, overlaySettleTransition);
    let unfolding: Promise<unknown> = Promise.resolve();
    if (flying) {
      const t = thumbRight(el);
      const closed = `inset(0px ${el.offsetWidth - t}px 0px 0px)`;
      el.style.clipPath = closed;
      // The flying cover owns the slot until it lands.
      if (slot) slot.style.visibility = "hidden";
      unfolding = animate(el, { clipPath: [closed, "inset(0px 0px 0px 0px)"] }, overlaySettleTransition).then(() => {
        el.style.clipPath = "";
      });
      window.setTimeout(() => slot?.style.removeProperty("visibility"), STEP * 1000);
    }
    void Promise.all([opening, unfolding]).then(() => {
      el.style.height = "";
      el.style.overflow = "";
      el.style.opacity = "";
    });
  }, [reduce]);

  useEffect(() => {
    if (present) return;
    const el = ref.current;
    const rev = reverseExits.get(rowKey);
    if (!el || reduce) {
      safeToRemove?.();
      return;
    }
    el.style.overflow = "hidden";
    const full = el.offsetHeight;
    if (!rev) {
      // Any other removal still closes its gap, so the rows below slide up instead of snapping.
      void Promise.all([
        animate(el, { height: [full, 0] }, overlaySettleTransition),
        animate(el, { opacity: [1, 0] }, overlaySettleTransition),
      ]).then(() => safeToRemove?.());
      return;
    }
    reverseExits.delete(rowKey);
    // The flying copy owns the thumbnail from the first frame; text folds into it while the row closes.
    const slot = el.querySelector<HTMLElement>(SLOT);
    if (slot) slot.style.visibility = "hidden";
    const folded = `inset(0px ${Math.max(0, rev.width - rev.thumbRight)}px 0px 0px)`;
    void Promise.all([
      animate(el, { clipPath: ["inset(0px 0px 0px 0px)", folded], opacity: [1, 0] }, overlaySettleTransition),
      animate(el, { height: [full, 0] }, overlaySettleTransition),
    ]).then(() => safeToRemove?.());
  }, [present, rowKey, reduce, safeToRemove]);

  return <div ref={ref}>{children}</div>;
}

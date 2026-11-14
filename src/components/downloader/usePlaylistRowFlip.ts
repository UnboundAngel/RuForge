import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

import { OVERLAY_EASE } from "../../lib/overlayMotion";

const FLIP_MS = 280;
const CANCELLED_OPACITY = 0.42;
const EASING = `cubic-bezier(${OVERLAY_EASE.join(", ")})`;

type Seen = { x: number; y: number; dim: boolean };

/**
 * Slides playlist rows to their new place after a cancel or restore, and fades in rows that stream
 * in. Rows carry `data-flip-key` (plus `data-flip-dim` when cancelled). Offsets come from
 * offsetLeft/offsetTop, so they ignore the transforms dnd-kit puts on rows mid-drag. Call `arm`
 * right before the state change; only that commit animates a move.
 */
export function usePlaylistRowFlip(
  containerRef: RefObject<HTMLElement | null>,
  reduceMotion: boolean,
): () => void {
  const prev = useRef<Map<string, Seen>>(new Map());
  const armed = useRef(false);

  const arm = useCallback(() => {
    armed.current = true;
  }, []);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const now = new Map<string, Seen>();
    const els = root.querySelectorAll<HTMLElement>("[data-flip-key]");
    els.forEach((el) => {
      now.set(el.dataset.flipKey ?? "", {
        x: el.offsetLeft,
        y: el.offsetTop,
        dim: el.dataset.flipDim === "1",
      });
    });
    const before = prev.current;
    const move = armed.current;
    armed.current = false;
    prev.current = now;
    if (reduceMotion || before.size === 0) return;

    els.forEach((el) => {
      const key = el.dataset.flipKey ?? "";
      const was = before.get(key);
      const cur = now.get(key);
      if (!cur) return;
      if (!was) {
        el.animate([{ opacity: 0 }, { opacity: cur.dim ? CANCELLED_OPACITY : 1 }], {
          duration: 200,
          easing: EASING,
        });
        return;
      }
      if (!move) return;
      const dx = was.x - cur.x;
      const dy = was.y - cur.y;
      if (dx !== 0 || dy !== 0) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration: FLIP_MS, easing: EASING },
        );
      }
      if (was.dim !== cur.dim) {
        el.animate(
          [
            { opacity: was.dim ? CANCELLED_OPACITY : 1 },
            { opacity: cur.dim ? CANCELLED_OPACITY : 1 },
          ],
          { duration: FLIP_MS, easing: EASING },
        );
      }
    });
  });

  return arm;
}

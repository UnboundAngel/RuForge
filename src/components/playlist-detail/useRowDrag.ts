import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Pointer-based row dragging. It never starts an HTML5 drag, so a reorder cannot reach the
 * downloader's URL drop intake. Rows part to show the slot, a ghost of the dragged row follows the
 * pointer freely (in a portal, so the list pane cannot clip it) and settles into place on release.
 * Dropping on the cover sets the start video instead.
 */

const START_DISTANCE = 4;
const EDGE = 64;
const MAX_SCROLL = 18;
const SETTLE_MS = 180;

type Rect = { top: number; height: number };

/**
 * The drop zone is generous: anywhere in the hero, or far enough right of the list's title column
 * that the pointer clearly left reordering, so a straight right or up-right drag lands.
 */
function inDropZone(plate: HTMLElement | null, x: number, y: number): boolean {
  const art = plate?.getBoundingClientRect();
  const hero = plate?.parentElement?.getBoundingClientRect();
  if (!art || !hero) return false;
  if (x >= hero.left && x <= hero.right && y >= hero.top && y <= hero.bottom) return true;
  return x >= art.left + art.width * 0.55 && x <= art.right;
}

export type GhostView = {
  key: string;
  /** The dragged row's box when the drag began. */
  rect: { left: number; top: number; width: number; height: number };
  /** Pointer travel since the drag began. */
  x: number;
  y: number;
  /** Target y once released, relative to `rect`; undefined while following the pointer. */
  settleY?: number;
  overCover: boolean;
  /** Pointer position in the window. */
  px: number;
  py: number;
};

type Drag = {
  key: string;
  index: number;
  over: number;
  /** Pixels the dragged row sits away from its own slot. */
  offset: number;
  overCover: boolean;
  settling: boolean;
  pitch: number;
  rect: GhostView["rect"];
  x: number;
  y: number;
  px: number;
  py: number;
  /** Scroll travel since the drag began. */
  scrolled: number;
};

export type RowDragView = {
  dragKey: string | null;
  overCover: boolean;
  ghost: GhostView | null;
  /** Vertical offset for the row at `index` (0 when it stays put). */
  shiftOf: (index: number, key: string) => number;
  /** True while the dropped row slides into its slot. */
  settling: boolean;
  onGripPointerDown: (e: React.PointerEvent, key: string, index: number) => void;
};

type Options = {
  enabled: boolean;
  keys: string[];
  scrollRef: RefObject<HTMLElement | null>;
  coverRef: RefObject<HTMLElement | null>;
  rowElement: (key: string) => HTMLElement | null;
  onReorder: (fromKey: string, toKey: string) => void;
  /** `from` is the dragged cover's box at release, for the fly-in. */
  onDropOnCover: (key: string, from: DOMRect | null) => void;
};

export function useRowDrag({
  enabled,
  keys,
  scrollRef,
  coverRef,
  rowElement,
  onReorder,
  onDropOnCover,
}: Options): RowDragView {
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef({ keys, onReorder, onDropOnCover, rowElement });
  live.current = { keys, onReorder, onDropOnCover, rowElement };
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent, key: string, index: number) => {
      if (!enabled || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const scroller = scrollRef.current;
      if (!scroller) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startScroll = scroller.scrollTop;
      let active = false;
      let pointerY = startY;
      let raf = 0;
      let rects: Rect[] = [];
      let pitch = 0;
      let rect0: GhostView["rect"] = { left: 0, top: 0, width: 0, height: 0 };
      let state: Drag | null = null;

      const measure = () => {
        rects = live.current.keys.map((k) => {
          const el = live.current.rowElement(k);
          const r = el?.getBoundingClientRect();
          return { top: (r?.top ?? 0) + scroller.scrollTop, height: r?.height ?? 0 };
        });
        const own = live.current.rowElement(key)?.getBoundingClientRect();
        if (own) rect0 = { left: own.left, top: own.top, width: own.width, height: own.height };
        pitch = rects.length > 1 ? rects[1].top - rects[0].top : (rects[0]?.height ?? 0);
      };

      const update = () => {
        const dy = pointerY - startY + (scroller.scrollTop - startScroll);
        const centre = rects[index].top + rects[index].height / 2 + dy;
        let over = index;
        let best = Infinity;
        rects.forEach((r, i) => {
          const d = Math.abs(r.top + r.height / 2 - centre);
          if (d < best) {
            best = d;
            over = i;
          }
        });
        const overCover = inDropZone(coverRef.current, lastX, pointerY);
        state = {
          key,
          index,
          over,
          offset: dy,
          overCover,
          settling: false,
          pitch,
          rect: rect0,
          x: lastX - startX,
          y: pointerY - startY,
          px: lastX,
          py: pointerY,
          scrolled: scroller.scrollTop - startScroll,
        };
        setDrag(state);
      };

      let lastX = startX;

      const tick = () => {
        raf = 0;
        if (!active) return;
        const box = scroller.getBoundingClientRect();
        let speed = 0;
        if (pointerY < box.top + EDGE) speed = -Math.ceil(((box.top + EDGE - pointerY) / EDGE) * MAX_SCROLL);
        else if (pointerY > box.bottom - EDGE) speed = Math.ceil(((pointerY - (box.bottom - EDGE)) / EDGE) * MAX_SCROLL);
        if (speed !== 0) {
          scroller.scrollTop += speed;
          update();
          raf = requestAnimationFrame(tick);
        }
      };

      const onMove = (ev: PointerEvent) => {
        lastX = ev.clientX;
        pointerY = ev.clientY;
        if (!active) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < START_DISTANCE) return;
          active = true;
          measure();
          document.body.style.cursor = "grabbing";
        }
        update();
        if (!raf) raf = requestAnimationFrame(tick);
      };

      const finish = (commit: boolean) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        document.body.style.cursor = "";
        if (raf) cancelAnimationFrame(raf);
        cleanup.current = null;
        const final = state;
        if (active) {
          // The release over a row would otherwise count as a click and start playback.
          const swallow = (ev: MouseEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
          };
          window.addEventListener("click", swallow, true);
          window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
        }
        if (!active || !final) {
          setDrag(null);
          return;
        }
        if (!commit) {
          setDrag(null);
          return;
        }
        if (final.overCover) {
          const from = document.querySelector("[data-drag-thumb]")?.getBoundingClientRect() ?? null;
          setDrag(null);
          live.current.onDropOnCover(key, from);
          return;
        }
        const toKey = live.current.keys[final.over];
        if (final.over === index || !toKey) {
          // Slide back into the own slot.
          setDrag({ ...final, offset: 0, settling: true, overCover: false });
          window.setTimeout(() => setDrag(null), SETTLE_MS);
          return;
        }
        const target = (final.over - index) * pitch;
        setDrag({ ...final, offset: target, settling: true, overCover: false });
        window.setTimeout(() => {
          live.current.onReorder(key, toKey);
          setDrag(null);
        }, SETTLE_MS);
      };

      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") finish(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
      cleanup.current = () => finish(false);
    },
    [coverRef, enabled, scrollRef],
  );

  const shiftOf = useCallback(
    (index: number, key: string) => {
      if (!drag) return 0;
      if (key === drag.key) return 0;
      const { index: from, pitch } = drag;
      const over = drag.overCover ? from : drag.over;
      if (from < over && index > from && index <= over) return -pitch;
      if (from > over && index >= over && index < from) return pitch;
      return 0;
    },
    [drag],
  );

  return {
    dragKey: drag?.key ?? null,
    overCover: drag?.overCover ?? false,
    ghost: drag
      ? {
          key: drag.key,
          rect: drag.rect,
          x: drag.settling ? 0 : drag.x,
          y: drag.settling ? 0 : drag.y,
          settleY: drag.settling ? drag.offset - drag.scrolled : undefined,
          overCover: drag.overCover,
          px: drag.px,
          py: drag.py,
        }
      : null,
    shiftOf,
    settling: drag?.settling ?? false,
    onGripPointerDown,
  };
}

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ARTBOARD, CURSOR_PX, SHAPES, type Shape } from "./cursorShapes";
import { resolveShape } from "./resolveCursor";

type Ring = { id: number; x: number; y: number };
type ShapeKey = keyof typeof SHAPES;

const SHAPE_KEYS = Object.keys(SHAPES) as ShapeKey[];
/** Held-button re-read period: drag libraries flip the cursor mid-drag with no pointer event to hook. */
const HELD_POLL_MS = 100;
const DRAG_START_PX = 4;
const px = (units: number) => (units / ARTBOARD) * CURSOR_PX;

/**
 * Pointer events, not mouse events: drag libraries preventDefault pointerdown, which suppresses the
 * mouse ones. The overlay is moved straight in the pointermove handler (no state, no spring) so it
 * tracks a live mouse 1:1; scripted runs get their smoothness from the eased mouse moves instead.
 * Shapes are all mounted up front and swapped by toggling opacity, so a change costs no layout.
 */
export function RecordingCursor() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<HTMLDivElement>(null);
  const [rings, setRings] = useState<Ring[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const press = pressRef.current;
    if (!wrap || !press) return;
    const imgs = new Map<string, HTMLElement>();
    press.querySelectorAll<HTMLElement>("[data-shape]").forEach((el) => imgs.set(el.dataset.shape ?? "", el));
    const at = { x: 0, y: 0 };
    let shown = false;
    let current: Shape = "default";
    let held = false;
    let down: { x: number; y: number; draggable: boolean } | null = null;
    let nativeDrag = false;
    let lastEl: Element | null = null;
    let poll = 0;
    let ringId = 0;

    const show = (v: boolean) => {
      if (v === shown) return;
      shown = v;
      wrap.style.opacity = v ? "1" : "0";
    };
    const place = (x: number, y: number) => {
      at.x = x;
      at.y = y;
      wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      show(true);
    };
    const setShape = (next: Shape) => {
      if (next === current) return;
      if (current !== "none") imgs.get(current)?.setAttribute("data-on", "false");
      if (next !== "none") imgs.get(next)?.setAttribute("data-on", "true");
      current = next;
    };
    const refresh = (el: Element | null) => {
      lastEl = el;
      let next = resolveShape(el, held);
      const dragged = down?.draggable && Math.hypot(at.x - down.x, at.y - down.y) > DRAG_START_PX;
      if ((nativeDrag || dragged) && next !== "none" && next !== "not-allowed" && next !== "no-drop") next = "grabbing";
      setShape(next);
    };
    const asEl = (t: EventTarget | null) => (t instanceof Element ? t : null);

    const onMove = (e: PointerEvent) => {
      place(e.clientX, e.clientY);
      if (e.target !== lastEl || held) refresh(asEl(e.target));
    };
    const onDown = (e: PointerEvent) => {
      held = true;
      const el = asEl(e.target);
      down = { x: e.clientX, y: e.clientY, draggable: !!el?.closest('[draggable="true"]') };
      place(e.clientX, e.clientY);
      press.setAttribute("data-pressed", "true");
      setRings((r) => [...r, { id: ++ringId, x: e.clientX, y: e.clientY }]);
      refresh(el);
      poll = window.setInterval(() => refresh(document.elementFromPoint(at.x, at.y)), HELD_POLL_MS);
    };
    const onUp = (e: PointerEvent) => {
      held = false;
      down = null;
      nativeDrag = false;
      window.clearInterval(poll);
      press.setAttribute("data-pressed", "false");
      refresh(asEl(e.target));
    };
    const onDragStart = () => {
      nativeDrag = true;
      refresh(lastEl);
    };
    const onDragEnd = () => {
      nativeDrag = false;
      held = false;
      window.clearInterval(poll);
      refresh(document.elementFromPoint(at.x, at.y));
    };
    // Native drags swallow pointer events, so the drag position comes from dragover.
    const onDragOver = (e: DragEvent) => place(e.clientX, e.clientY);
    const hide = () => show(false);

    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("pointerdown", onDown, opts);
    window.addEventListener("pointerup", onUp, opts);
    window.addEventListener("pointercancel", onUp, opts);
    window.addEventListener("dragstart", onDragStart, opts);
    window.addEventListener("dragend", onDragEnd, opts);
    window.addEventListener("drop", onDragEnd, opts);
    window.addEventListener("dragover", onDragOver, opts);
    document.documentElement.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
      window.removeEventListener("dragstart", onDragStart, { capture: true });
      window.removeEventListener("dragend", onDragEnd, { capture: true });
      window.removeEventListener("drop", onDragEnd, { capture: true });
      window.removeEventListener("dragover", onDragOver, { capture: true });
      document.documentElement.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[2147483647]" aria-hidden>
      <div
        ref={wrapRef}
        className="absolute left-0 top-0 opacity-0 will-change-transform drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]"
      >
        <div
          ref={pressRef}
          data-pressed="false"
          className="origin-top-left transition-transform duration-100 ease-out data-[pressed=true]:scale-[0.86]"
        >
          {SHAPE_KEYS.map((key) => (
            <img
              key={key}
              src={SHAPES[key].url}
              data-shape={key}
              data-on={key === "default"}
              width={CURSOR_PX}
              height={CURSOR_PX}
              alt=""
              draggable={false}
              decoding="sync"
              className="absolute max-w-none opacity-0 transition-opacity duration-100 data-[on=true]:opacity-100"
              style={{ left: -px(SHAPES[key].hx), top: -px(SHAPES[key].hy) }}
            />
          ))}
        </div>
      </div>
      {rings.map((r) => (
        <div
          key={r.id}
          className="rf-rec-ring absolute left-0 top-0 h-9 w-9 rounded-full border-2 border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{ "--rf-rec-x": `${r.x}px`, "--rf-rec-y": `${r.y}px` } as CSSProperties}
          onAnimationEnd={() => setRings((all) => all.filter((x) => x.id !== r.id))}
        />
      ))}
    </div>,
    document.body,
  );
}

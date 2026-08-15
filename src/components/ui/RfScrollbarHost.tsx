import { useEffect } from "react";

const THUMB_CLASS = "rf-scrollbar-thumb";
const MIN_THUMB = 32;

type Bind = {
  thumb: HTMLElement;
  stop: () => void;
};

const bound = new WeakMap<HTMLElement, Bind>();
const boundEls = new Set<HTMLElement>();

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function bindRfScrollbar(el: HTMLElement) {
  if (bound.has(el)) return;
  if (el.classList.contains("scrollbar-none")) return;

  const thumb = document.createElement("div");
  thumb.className = THUMB_CLASS;
  thumb.setAttribute("aria-hidden", "true");

  const style = getComputedStyle(el);
  if (style.position === "static") el.style.position = "relative";
  el.appendChild(thumb);

  let thumbH = MIN_THUMB;
  let thumbTop = 0;
  let dragging = false;
  let dragStartY = 0;
  let dragStartTop = 0;

  const paint = () => {
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${el.scrollTop + thumbTop}px)`;
  };

  const layout = () => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 1) {
      thumb.style.opacity = "0";
      thumb.style.pointerEvents = "none";
      return;
    }
    thumb.style.opacity = "1";
    thumb.style.pointerEvents = "auto";
    thumbH = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight);
    const maxThumb = Math.max(0, clientHeight - thumbH);
    thumbTop = maxThumb <= 0 ? 0 : (scrollTop / maxScroll) * maxThumb;
    paint();
  };

  const onScroll = () => {
    if (!dragging) layout();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const maxThumb = Math.max(0, el.clientHeight - thumbH);
    const nextTop = clamp(dragStartTop + (e.clientY - dragStartY), 0, maxThumb);
    el.scrollTop = maxThumb <= 0 ? 0 : (nextTop / maxThumb) * maxScroll;
    thumbTop = nextTop;
    paint();
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    thumb.dataset.dragging = "false";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const onPointerUp = (e: PointerEvent) => {
    try {
      thumb.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    endDrag();
    layout();
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    thumb.dataset.dragging = "true";
    dragStartY = e.clientY;
    dragStartTop = thumbTop;
    thumb.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  thumb.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("scroll", onScroll, { passive: true });
  const ro = new ResizeObserver(() => layout());
  ro.observe(el);

  layout();
  requestAnimationFrame(layout);

  bound.set(el, {
    thumb,
    stop: () => {
      endDrag();
      thumb.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      thumb.remove();
      bound.delete(el);
      boundEls.delete(el);
    },
  });
  boundEls.add(el);
}

function unbindRfScrollbar(el: HTMLElement) {
  bound.get(el)?.stop();
}

export function startRfScrollbars(root: ParentNode = document.body): () => void {
  const scan = () => {
    for (const el of [...boundEls]) {
      if (!el.isConnected || !el.classList.contains("rf-scrollbar")) unbindRfScrollbar(el);
    }
    root.querySelectorAll<HTMLElement>(".rf-scrollbar").forEach((el) => {
      if (el.isConnected) bindRfScrollbar(el);
    });
  };

  const mo = new MutationObserver(scan);
  mo.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  scan();

  return () => {
    mo.disconnect();
    for (const el of [...boundEls]) unbindRfScrollbar(el);
  };
}

export function RfScrollbarHost() {
  useEffect(() => startRfScrollbars(), []);
  return null;
}

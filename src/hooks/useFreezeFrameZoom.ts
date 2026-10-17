import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  ZOOM_IDENTITY,
  clampPan,
  containRect,
  isZoomed,
  panBy,
  zoomAt,
  type ZoomState,
} from "../lib/freezeFrameZoom";

const DRAG_THRESHOLD_PX = 4;
/** Seeks shorter than this are frame steps and keep the zoom; longer ones reset it. */
const FRAME_STEP_MAX_SEC = 0.25;
/** A zoomed single click waits this long so a double-click can reset instead of toggling play. */
const ZOOMED_CLICK_DELAY_MS = 300;

type Options = {
  /** Untransformed, overflow-hidden box the video fills. */
  viewportRef: RefObject<HTMLElement | null>;
  mediaRef: RefObject<HTMLMediaElement | null>;
  /** True only while a video is visible and paused. */
  enabled: boolean;
};

export type FreezeFrameZoom = {
  scale: number;
  zoomed: boolean;
  /** Value for `data-zoom` on the viewport and media element. */
  dataZoom: "zoomed" | "dragging" | undefined;
  mediaStyle: CSSProperties | undefined;
  reset: () => void;
  handleClick: (action: () => void) => void;
  handleDoubleClick: (action: () => void) => void;
};

export function useFreezeFrameZoom({ viewportRef, mediaRef, enabled }: Options): FreezeFrameZoom {
  const [state, setState] = useState<ZoomState>(ZOOM_IDENTITY);
  const [dragging, setDragging] = useState(false);
  const stateRef = useRef(state);
  const enabledRef = useRef(enabled);
  const suppressClickRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  enabledRef.current = enabled;

  const commit = useCallback((next: ZoomState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearClickTimer = useCallback(() => {
    if (clickTimerRef.current != null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    dragCleanupRef.current?.();
    setDragging(false);
    if (stateRef.current !== ZOOM_IDENTITY) commit(ZOOM_IDENTITY);
  }, [commit]);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    const size = { width: viewport.clientWidth, height: viewport.clientHeight };
    if (size.width <= 0 || size.height <= 0) return null;
    // Ancestors may scale the viewport (comments drawer); pointer deltas are in screen px.
    const outerScale = rect.width / size.width || 1;
    const video = mediaRef.current as HTMLVideoElement | null;
    const content = containRect(size, {
      width: video?.videoWidth ?? 0,
      height: video?.videoHeight ?? 0,
    });
    return { rect, size, outerScale, content };
  }, [viewportRef, mediaRef]);

  useEffect(() => {
    if (!enabled) {
      clearClickTimer();
      reset();
    }
  }, [enabled, reset, clearClickTimer]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (!enabledRef.current) return;
      const m = measure();
      if (!m) return;
      const delta =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * m.size.height : e.deltaY;
      if (delta === 0) return;
      const cursor = {
        x: (e.clientX - m.rect.left) / m.outerScale,
        y: (e.clientY - m.rect.top) / m.outerScale,
      };
      const next = clampPan(zoomAt(stateRef.current, cursor, delta), m.size, m.content);
      if (!isZoomed(next)) reset();
      else commit(next);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !enabledRef.current || !isZoomed(stateRef.current)) return;
      if (e.target instanceof Element && e.target.closest("[data-freeze-zoom-ignore]")) return;
      dragCleanupRef.current?.();
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = stateRef.current;
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          moved = true;
          setDragging(true);
          try {
            viewport.setPointerCapture(pointerId);
          } catch {
            /* pointer already released */
          }
        }
        const m = measure();
        if (!m) return;
        commit(clampPan(panBy(origin, dx / m.outerScale, dy / m.outerScale), m.size, m.content));
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null;
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        cleanup();
        if (!moved) return;
        setDragging(false);
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      dragCleanupRef.current = cleanup;
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointerdown", onPointerDown);
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      dragCleanupRef.current?.();
    };
    // `enabled` re-binds when the viewport mounts late (audio to video swap).
  }, [enabled, viewportRef, measure, commit, reset]);

  const zoomed = isZoomed(state);

  useEffect(() => {
    if (!zoomed) return;
    const media = mediaRef.current;
    const viewport = viewportRef.current;
    let settled = media?.currentTime ?? 0;
    const onSeeking = () => {
      if (media && Math.abs(media.currentTime - settled) > FRAME_STEP_MAX_SEC) reset();
    };
    const onSeeked = () => {
      if (media) settled = media.currentTime;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      clearClickTimer();
      reset();
    };
    const resize = new ResizeObserver(() => {
      const m = measure();
      if (m) commit(clampPan(stateRef.current, m.size, m.content));
    });
    media?.addEventListener("seeking", onSeeking);
    media?.addEventListener("seeked", onSeeked);
    media?.addEventListener("emptied", reset);
    window.addEventListener("keydown", onKey, true);
    if (viewport) resize.observe(viewport);
    return () => {
      media?.removeEventListener("seeking", onSeeking);
      media?.removeEventListener("seeked", onSeeked);
      media?.removeEventListener("emptied", reset);
      window.removeEventListener("keydown", onKey, true);
      resize.disconnect();
    };
  }, [zoomed, mediaRef, viewportRef, measure, commit, reset, clearClickTimer]);

  useEffect(() => clearClickTimer, [clearClickTimer]);

  const handleClick = useCallback(
    (action: () => void) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (!isZoomed(stateRef.current)) {
        action();
        return;
      }
      clearClickTimer();
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null;
        action();
      }, ZOOMED_CLICK_DELAY_MS);
    },
    [clearClickTimer],
  );

  const handleDoubleClick = useCallback(
    (action: () => void) => {
      if (isZoomed(stateRef.current) || clickTimerRef.current != null) {
        clearClickTimer();
        reset();
        return;
      }
      action();
    },
    [clearClickTimer, reset],
  );

  return {
    scale: state.scale,
    zoomed,
    dataZoom: zoomed ? (dragging ? "dragging" : "zoomed") : undefined,
    mediaStyle: zoomed
      ? { transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})` }
      : undefined,
    reset,
    handleClick,
    handleDoubleClick,
  };
}

import { useEffect, useRef, useState, type RefObject } from "react";

const TRIGGER_PX = 64;
const MAX_PULL_PX = 120;
const MIN_BUSY_MS = 900;
const FADE_MS = 360;
const RUBBER = 0.5;
const RING_LEN = 88;

export type PullPhase = "idle" | "busy" | "done";

type Options = {
  /** The page scrollers; a pull only starts when one of these is at the top. */
  scrollers: RefObject<Record<string, HTMLElement | null>>;
  enabled: boolean;
  onRefresh: () => Promise<void>;
};

/** Pull past the top of a page: the page follows the finger, a ring fills, and on release a line above the filters pulses while the PC is re-checked. */
export function usePullToRefresh({ scrollers, enabled, onRefresh }: Options) {
  const ringRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<PullPhase>("idle");
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let scroller: HTMLElement | null = null;
    let body: HTMLElement | null = null;
    let startY = 0;
    let pull = 0;
    let pulling = false;

    const paint = (dist: number, animate: boolean) => {
      if (body) {
        body.style.transition = animate ? "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)" : "none";
        body.style.transform = dist > 0 ? `translate3d(0, ${dist}px, 0)` : "";
      }
      const ring = ringRef.current;
      if (!ring) return;
      const p = Math.min(1, dist / TRIGGER_PX);
      ring.style.transition = animate ? "opacity 200ms" : "none";
      ring.style.opacity = String(Math.min(1, p * 1.6));
      ring.style.setProperty("--pull", String(p));
    };

    const onStart = (e: TouchEvent) => {
      scroller = null;
      body = null;
      pulling = false;
      if (busyRef.current || e.touches.length !== 1) return;
      const el = (e.target as Element).closest<HTMLElement>(".ph-scroll");
      if (!el || el.hidden || el.classList.contains("ph-scroll--page")) return;
      if (!Object.values(scrollers.current ?? {}).includes(el) || el.scrollTop > 0) return;
      scroller = el;
      body = el.firstElementChild as HTMLElement | null;
      startY = e.touches[0]!.clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!scroller) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0 || scroller.scrollTop > 0) {
        if (pulling) paint(0, false);
        pulling = false;
        return;
      }
      pulling = true;
      pull = Math.min(MAX_PULL_PX, dy * RUBBER);
      if (e.cancelable) e.preventDefault();
      paint(pull, false);
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      const triggered = pull >= TRIGGER_PX;
      paint(0, true);
      scroller = null;
      if (!triggered) return;
      busyRef.current = true;
      setPhase("busy");
      const started = performance.now();
      void refreshRef.current().finally(() => {
        window.setTimeout(() => {
          setPhase("done");
          window.setTimeout(() => {
            busyRef.current = false;
            setPhase("idle");
          }, FADE_MS);
        }, Math.max(0, MIN_BUSY_MS - (performance.now() - started)));
      });
    };

    const root = document.querySelector(".ph-main") ?? document;
    root.addEventListener("touchstart", onStart as EventListener, { passive: true });
    root.addEventListener("touchmove", onMove as EventListener, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onEnd);
    return () => {
      root.removeEventListener("touchstart", onStart as EventListener);
      root.removeEventListener("touchmove", onMove as EventListener);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, scrollers]);

  return { ringRef, phase };
}

export function PullRing({ ringRef, phase }: { ringRef: RefObject<HTMLDivElement | null>; phase: PullPhase }) {
  return (
    <>
      <div ref={ringRef as RefObject<HTMLDivElement>} className="ph-pull" aria-hidden>
        <svg viewBox="0 0 32 32" width="32" height="32">
          <circle className="ph-pull-track" cx="16" cy="16" r="14" />
          <circle className="ph-pull-fill" cx="16" cy="16" r="14" strokeDasharray={RING_LEN} />
        </svg>
      </div>
      <span className={`ph-pull-line ph-pull-line--${phase}`} role="status" aria-live="polite" aria-hidden={phase === "idle"} />
      {phase === "busy" ? <span className="ph-sr">Checking your PC</span> : null}
    </>
  );
}

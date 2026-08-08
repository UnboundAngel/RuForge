import { useEffect, useRef, useState } from "react";

const HOLD_MS = 500;

function isTypingTarget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export function useAltHoldProgress(
  paint: (progress: number) => void,
  onHoldComplete?: () => void,
  /** Change this to clear a finished hold so Alt can advance the next beat. */
  resetKey: string | number = 0,
): { holdComplete: boolean; altHeld: boolean } {
  const [holdComplete, setHoldComplete] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const holdingRef = useRef(false);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const paintRef = useRef(paint);
  const onHoldCompleteRef = useRef(onHoldComplete);
  const progressHeldRef = useRef(0);
  paintRef.current = paint;
  onHoldCompleteRef.current = onHoldComplete;

  useEffect(() => {
    holdingRef.current = false;
    progressHeldRef.current = 0;
    setHoldComplete(false);
    setAltHeld(false);
    paintRef.current(0);
  }, [resetKey]);

  useEffect(() => {
    const cancelRaf = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    const frame = () => {
      if (!holdingRef.current || holdComplete) return;
      const elapsed = performance.now() - startRef.current;
      const linear = Math.min(1, elapsed / HOLD_MS);
      progressHeldRef.current = linear;
      paintRef.current(linear);
      if (linear >= 1) {
        holdingRef.current = false;
        progressHeldRef.current = 1;
        paintRef.current(1);
        setHoldComplete(true);
        onHoldCompleteRef.current?.();
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat) return;
      if (isTypingTarget()) return;
      setAltHeld(true);
      if (holdComplete) return;
      holdingRef.current = true;
      const current = progressHeldRef.current;
      startRef.current = performance.now() - current * HOLD_MS;
      cancelRaf();
      rafRef.current = requestAnimationFrame(frame);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      setAltHeld(false);
      if (holdComplete) return;
      holdingRef.current = false;
      cancelRaf();
      progressHeldRef.current = 0;
      paintRef.current(0);
    };

    const onBlur = () => {
      setAltHeld(false);
      if (holdComplete) return;
      holdingRef.current = false;
      cancelRaf();
      progressHeldRef.current = 0;
      paintRef.current(0);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      cancelRaf();
    };
  }, [holdComplete]);

  return { holdComplete, altHeld };
}

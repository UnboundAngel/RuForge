import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

export type StreakTiming = {
  /** Seconds to run from the start of the fill to a head at `end` (0-1). */
  travel: (end: number) => number;
  ease: (k: number) => number;
  /** Derivative of `ease`, for the speed-driven streak length. */
  slope: (k: number) => number;
  /** Streak length per unit of speed (fill lengths per second), like a motion trail. */
  lenPerSpeed: number;
  minLen: number;
  maxLen: number;
  fadeInS: number;
  fadeOutS: number;
  restS: number;
};

export type StreakFrame = { x: number; len: number; opacity: number };

export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeInOutCubicSlope = (k: number) => (k < 0.5 ? 12 * k * k : 3 * Math.pow(-2 * k + 2, 2));
export const easeInOutSine = (k: number) => -(Math.cos(Math.PI * k) - 1) / 2;
export const easeInOutSineSlope = (k: number) => (Math.PI / 2) * Math.sin(Math.PI * k);

export function streakFrame(timing: StreakTiming, t: number, end: number): StreakFrame {
  const travel = timing.travel(end);
  const k = Math.min(1, t / travel);
  const x = end * timing.ease(k);
  const speed = k < 1 ? (end * timing.slope(k)) / travel : 0;
  const len = Math.min(timing.maxLen, x, Math.max(timing.minLen, speed * timing.lenPerSpeed));
  const opacity =
    t < timing.fadeInS
      ? t / timing.fadeInS
      : t <= travel
        ? 1
        : Math.max(0, 1 - (t - travel) / timing.fadeOutS);
  return { x, len: Math.max(len, 0), opacity };
}

/**
 * Runs a streak from the start of a progress fill to its head, fades, rests, and goes again.
 * Each run reads the latest progress at its start so updates never restart it. Frames go
 * straight to `onFrame` (imperative DOM writes) so a 60fps loop never re-renders React.
 */
export function useProgressStreak(
  pct: number,
  timing: StreakTiming,
  onFrame: (frame: StreakFrame) => void,
): boolean {
  const reduceMotion = useReducedMotion() ?? false;
  const pctRef = useRef(pct);
  pctRef.current = pct;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const timingRef = useRef(timing);
  timingRef.current = timing;

  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    let start = performance.now();
    let end = Math.min(100, Math.max(0, pctRef.current)) / 100;
    const tick = (now: number) => {
      const tm = timingRef.current;
      let t = (now - start) / 1000;
      if (t > tm.travel(end) + tm.fadeOutS + tm.restS) {
        start = now;
        end = Math.min(100, Math.max(0, pctRef.current)) / 100;
        t = 0;
      }
      onFrameRef.current(streakFrame(tm, t, end));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  return !reduceMotion;
}

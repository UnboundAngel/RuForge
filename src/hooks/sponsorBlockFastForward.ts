import { holdMediaMute } from "../applyMediaOutputState";

/** Wall time a skip takes to play through. */
export const FAST_FORWARD_SEC = 1.2;
/** Chromium's playbackRate ceiling; past this the element throws. */
const MAX_RATE = 16;
const MIN_RATE = 2;
/** Shorter skips jump; a sprint over a couple of seconds reads as a stutter. */
const MIN_SPAN_SEC = 3;
/** Safety net if the element stalls (buffering, decode backlog) and never reaches the target. */
const STALL_GRACE_MS = 1500;

export type FastForwardArgs = {
  el: HTMLMediaElement | null;
  from: number;
  to: number;
  seekTo: (seconds: number) => void;
  onLand: () => void;
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Plays muted at up to 16x from `from` to `to` so the viewer sees the skip happen.
 * Spans too long for 16x get one seek to the last stretch first. Returns a cancel that restores the element.
 */
export function startFastForward({ el, from, to, seekTo, onLand }: FastForwardArgs): () => void {
  const span = to - from;
  if (!el || el.paused || span < MIN_SPAN_SEC || prefersReducedMotion()) {
    seekTo(to);
    onLand();
    return () => {};
  }

  const reach = MAX_RATE * FAST_FORWARD_SEC;
  if (span > reach) seekTo(to - reach);
  const rate = Math.min(MAX_RATE, Math.max(MIN_RATE, Math.min(span, reach) / FAST_FORWARD_SEC));

  const prevRate = el.playbackRate;
  const releaseMute = holdMediaMute(el);
  el.playbackRate = rate;

  const deadline = performance.now() + FAST_FORWARD_SEC * 1000 + STALL_GRACE_MS;
  let raf: number | null = null;
  let done = false;

  const restore = () => {
    if (done) return;
    done = true;
    if (raf != null) cancelAnimationFrame(raf);
    el.playbackRate = prevRate;
    releaseMute();
  };

  const tick = (now: number) => {
    // Direct writes (mini player mute toggles, speed sync) bypass the hold; take the element back.
    if (!el.muted) el.muted = true;
    if (el.playbackRate !== rate) el.playbackRate = rate;
    // Players only redraw progress on timeupdate (~4 Hz); at sprint speed that is visible hops.
    el.dispatchEvent(new Event("timeupdate"));
    if (el.currentTime >= to - 0.05 || el.paused || el.ended || now > deadline) {
      restore();
      if (el.currentTime < to - 0.05) seekTo(to);
      onLand();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return restore;
}

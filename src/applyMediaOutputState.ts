/** UI slider 0..1 → element gain. Quadratic taper: finer control near zero, full scale at 100%. */
export function uiVolumeToGain(ui: number): number {
  const u = Number.isFinite(ui) ? Math.max(0, Math.min(1, ui)) : 1;
  if (u <= 0) return 0;
  return u * u;
}

/** Elements under a temporary mute hold, mapped to the mute state players asked for meanwhile. */
const muteHolds = new WeakMap<HTMLMediaElement, boolean>();

/**
 * Silences `el` until released, even if a player re-applies output (canplay, volume sync) in between.
 * Release restores the latest mute state a player requested during the hold.
 */
export function holdMediaMute(el: HTMLMediaElement): () => void {
  if (!muteHolds.has(el)) muteHolds.set(el, el.muted);
  el.muted = true;
  return () => {
    if (!muteHolds.has(el)) return;
    el.muted = muteHolds.get(el) ?? false;
    muteHolds.delete(el);
  };
}

/** Apply store volume/mute to a local `<video>` / `<audio>` (WebView autoplay may leave `muted` true). */
export function applyMediaOutputState(
  el: HTMLMediaElement,
  volume: number,
  muted: boolean,
): void {
  el.volume = uiVolumeToGain(volume);
  if (muteHolds.has(el)) {
    muteHolds.set(el, muted);
    el.muted = true;
    return;
  }
  el.muted = muted;
}

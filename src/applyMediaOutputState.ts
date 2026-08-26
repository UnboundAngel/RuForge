/** UI slider 0..1 → element gain. Quadratic taper: finer control near zero, full scale at 100%. */
export function uiVolumeToGain(ui: number): number {
  const u = Number.isFinite(ui) ? Math.max(0, Math.min(1, ui)) : 1;
  if (u <= 0) return 0;
  return u * u;
}

/** Apply store volume/mute to a local `<video>` / `<audio>` (WebView autoplay may leave `muted` true). */
export function applyMediaOutputState(
  el: HTMLMediaElement,
  volume: number,
  muted: boolean,
): void {
  el.volume = uiVolumeToGain(volume);
  el.muted = muted;
}

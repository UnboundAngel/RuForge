/** Apply store volume/mute to a local `<video>` / `<audio>` (WebView autoplay may leave `muted` true). */
export function applyMediaOutputState(
  el: HTMLMediaElement,
  volume: number,
  muted: boolean,
): void {
  const v = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
  el.volume = v;
  el.muted = muted;
}

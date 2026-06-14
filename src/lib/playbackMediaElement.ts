import { releaseAnalyserGraph } from "@/audioAnalyserGraph";
import type { MainPlaybackBridgeOwner } from "@/playback/bridgeArbitration";

let mediaElement: HTMLMediaElement | null = null;
let owner: MainPlaybackBridgeOwner | null = null;
const listeners = new Set<() => void>();

export function getPlaybackMediaElementOwner(): MainPlaybackBridgeOwner | null {
  return owner;
}

function notify() {
  for (const fn of listeners) fn();
}

export function registerPlaybackMediaElement(
  bridgeOwner: MainPlaybackBridgeOwner,
  el: HTMLMediaElement | null,
) {
  if (el === null) {
    if (owner === bridgeOwner) {
      mediaElement = null;
      owner = null;
      notify();
    }
    return;
  }

  owner = bridgeOwner;
  mediaElement = el;
  notify();
}

export function getPlaybackMediaElement(): HTMLMediaElement | null {
  return mediaElement;
}

export function subscribePlaybackMediaElement(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function teardownPlaybackMediaElement(bridgeOwner: MainPlaybackBridgeOwner): void {
  if (owner !== bridgeOwner || !mediaElement) return;
  const el = mediaElement;
  el.pause();
  releaseAnalyserGraph(el, true);
  el.removeAttribute("src");
  el.load();
  mediaElement = null;
  owner = null;
  notify();
}

import { convertFileSrc } from "@tauri-apps/api/core";

import { primaryArtist, rawArtistFromFile } from "@/components/music/musicArtist";
import { noteIslandSkipDir } from "@/lib/islandSkipDirection";
import {
  getMainPlaybackBridge,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import { bestCoverPath, isAudioOnlyPath } from "@/mediaKind";
import { useRuforgeStore } from "@/store/ruforgeStore";

function canUseMediaSession(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

function applyTransport(action: "play" | "pause" | "prev" | "next"): void {
  const bridge = getMainPlaybackBridge();
  if (!bridge) return;

  if (action === "play") {
    if (bridge.paused) bridge.togglePlay?.();
    return;
  }
  if (action === "pause") {
    if (!bridge.paused) bridge.togglePlay?.();
    return;
  }
  if (action === "prev") {
    noteIslandSkipDir(-1);
    if (bridge.skipPrev) {
      bridge.skipPrev();
      return;
    }
    if (bridge.seek && bridge.currentTime > 0) {
      bridge.seek(0);
    }
    return;
  }
  if (action === "next") {
    noteIslandSkipDir(1);
    bridge.skipNext?.();
  }
}

function syncMediaSessionPlaybackState(): void {
  if (!canUseMediaSession()) return;
  const bridge = getMainPlaybackBridge();
  const file = useRuforgeStore.getState().playingFile;
  if (!bridge || !file) {
    navigator.mediaSession.playbackState = "none";
    return;
  }
  navigator.mediaSession.playbackState = bridge.paused ? "paused" : "playing";
}

function syncMediaSessionMetadata(): void {
  if (!canUseMediaSession()) return;
  const file = useRuforgeStore.getState().playingFile;
  if (!file) {
    navigator.mediaSession.metadata = null;
    return;
  }

  const title = file.name || "RuForge";
  const artist = isAudioOnlyPath(file.path)
    ? primaryArtist(rawArtistFromFile(file)) || ""
    : "";
  const artwork: MediaImage[] = [];
  const coverPath = bestCoverPath(file) ?? file.thumbnailPath ?? file.ruforgePosterPath ?? null;
  if (coverPath) {
    artwork.push({ src: convertFileSrc(coverPath) });
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    artwork,
  });
}

function syncMediaSessionPosition(): void {
  if (!canUseMediaSession()) return;
  const bridge = getMainPlaybackBridge();
  if (!bridge || !(bridge.duration > 0)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: bridge.duration,
      playbackRate: 1,
      position: Math.min(bridge.duration, Math.max(0, bridge.currentTime)),
    });
  } catch {
    /* WebView may reject invalid position updates */
  }
}

/**
 * OS / keyboard media keys: play-pause often works via the media element alone.
 * nexttrack / previoustrack need Media Session handlers on the main webview.
 */
export function setupMediaSessionTransport(): () => void {
  if (!canUseMediaSession()) {
    return () => undefined;
  }

  const setHandler = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null,
  ) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* action unsupported in this WebView */
    }
  };

  setHandler("play", () => applyTransport("play"));
  setHandler("pause", () => applyTransport("pause"));
  setHandler("stop", () => applyTransport("pause"));
  setHandler("previoustrack", () => applyTransport("prev"));
  setHandler("nexttrack", () => applyTransport("next"));
  setHandler("seekbackward", (details) => {
    const bridge = getMainPlaybackBridge();
    if (!bridge?.seek) return;
    const offset = details.seekOffset ?? 10;
    bridge.seek(Math.max(0, bridge.currentTime - offset));
  });
  setHandler("seekforward", (details) => {
    const bridge = getMainPlaybackBridge();
    if (!bridge?.seek) return;
    const offset = details.seekOffset ?? 10;
    const end = bridge.duration > 0 ? bridge.duration : bridge.currentTime + offset;
    bridge.seek(Math.min(end, bridge.currentTime + offset));
  });
  setHandler("seekto", (details) => {
    const bridge = getMainPlaybackBridge();
    if (!bridge?.seek || details.seekTime == null) return;
    bridge.seek(details.seekTime);
  });

  const refresh = () => {
    syncMediaSessionMetadata();
    syncMediaSessionPlaybackState();
    syncMediaSessionPosition();
  };

  refresh();
  const unsubBridge = subscribeMainPlaybackBridge(refresh);
  const unsubStore = useRuforgeStore.subscribe(refresh);

  return () => {
    unsubBridge();
    unsubStore();
    setHandler("play", null);
    setHandler("pause", null);
    setHandler("stop", null);
    setHandler("previoustrack", null);
    setHandler("nexttrack", null);
    setHandler("seekbackward", null);
    setHandler("seekforward", null);
    setHandler("seekto", null);
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  };
}

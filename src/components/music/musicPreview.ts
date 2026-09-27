import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { applyMediaOutputState } from "@/applyMediaOutputState";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { showMusicToast } from "./musicToast";
import type { OutsideTrack } from "./musicOutsideRecommend";
import { type PreviewStream, previewStreamFresh } from "./musicPreviewStream";

export type PreviewStatus = "loading" | "playing" | "paused";

type PreviewState = {
  videoId: string | null;
  status: PreviewStatus | null;
  /** 0..1 through the song. */
  progress: number;
};

export const useMusicPreview = create<PreviewState>(() => ({ videoId: null, status: null, progress: 0 }));

const cache = new Map<string, { stream: PreviewStream; at: number }>();
const nowSec = () => Math.floor(Date.now() / 1000);

async function resolveStream(track: OutsideTrack): Promise<PreviewStream> {
  const hit = cache.get(track.videoId);
  if (hit && previewStreamFresh(hit.stream, hit.at, nowSec())) return hit.stream;
  const { settings } = useRuforgeStore.getState();
  const stream = await invoke<PreviewStream>("resolve_music_preview_stream", {
    url: track.url,
    browserCookies: settings.browserContext || null,
    cookieFile: settings.cookieFile || null,
    preferOpus: ensureAudio().canPlayType('audio/mp4; codecs="mp4a.40.2"') === "",
  });
  cache.set(track.videoId, { stream, at: nowSec() });
  return stream;
}

/** The main player, as the preview sees it: paused for the preview, resumed after if it was playing. */
export type MainPlaybackBridge = { playing: () => boolean; pause: () => void; resume: () => void };

let bridge: MainPlaybackBridge | null = null;
let pausedMain = false;
let audio: HTMLAudioElement | null = null;
/** Bumped on every start and stop so a slow stream lookup can't start a song the user moved past. */
let generation = 0;
const LOAD_TIMEOUT_MS = 15_000;

export function setMusicPreviewMainBridge(next: MainPlaybackBridge | null): void {
  bridge = next;
}

function syncOutput(el: HTMLAudioElement) {
  const { volume, isMuted } = useRuforgeStore.getState();
  applyMediaOutputState(el, volume, isMuted);
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const el = new Audio();
  el.preload = "auto";
  el.addEventListener("timeupdate", () => {
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) useMusicPreview.setState({ progress: el.currentTime / d });
  });
  el.addEventListener("playing", () => useMusicPreview.setState({ status: "playing" }));
  el.addEventListener("ended", () => stopMusicPreview());
  el.addEventListener("error", () => {
    const id = useMusicPreview.getState().videoId;
    if (!id) return;
    cache.delete(id);
    stopMusicPreview();
    showMusicToast("Couldn't play the preview", "error");
  });
  useRuforgeStore.subscribe((s, prev) => {
    if (s.volume !== prev.volume || s.isMuted !== prev.isMuted) syncOutput(el);
  });
  audio = el;
  return el;
}

function releaseMain() {
  if (pausedMain && bridge && !bridge.playing()) bridge.resume();
  pausedMain = false;
}

/** Ends any preview; the main player picks up where it was if the preview paused it. */
export function stopMusicPreview(opts: { resumeMain?: boolean } = {}): void {
  generation++;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (useMusicPreview.getState().videoId) useMusicPreview.setState({ videoId: null, status: null, progress: 0 });
  if (opts.resumeMain === false) pausedMain = false;
  else releaseMain();
}

/** Play, pause or resume a song's preview. Starting one pauses the main player. */
export async function toggleMusicPreview(track: OutsideTrack): Promise<void> {
  const { videoId, status } = useMusicPreview.getState();
  const el = ensureAudio();
  if (videoId === track.videoId) {
    if (status === "playing") {
      el.pause();
      useMusicPreview.setState({ status: "paused" });
    } else if (status === "paused") {
      void el.play().catch(() => stopMusicPreview());
    } else {
      stopMusicPreview();
    }
    return;
  }

  const hadPausedMain = pausedMain;
  stopMusicPreview({ resumeMain: false });
  pausedMain = hadPausedMain;
  const mine = ++generation;
  if (!pausedMain && bridge?.playing()) {
    bridge.pause();
    pausedMain = true;
  }
  useMusicPreview.setState({ videoId: track.videoId, status: "loading", progress: 0 });
  try {
    const stream = await resolveStream(track);
    if (mine !== generation) return;
    syncOutput(el);
    el.src = stream.url;
    // A stream that never starts would otherwise leave the spinner up forever.
    window.setTimeout(() => {
      if (mine !== generation || useMusicPreview.getState().status !== "loading") return;
      cache.delete(track.videoId);
      stopMusicPreview();
      showMusicToast("Couldn't play the preview", "error");
    }, LOAD_TIMEOUT_MS);
    await el.play();
  } catch {
    if (mine !== generation) return;
    cache.delete(track.videoId);
    stopMusicPreview();
    showMusicToast("Couldn't play the preview", "error");
  }
}

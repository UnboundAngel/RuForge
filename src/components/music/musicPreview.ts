import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { applyMediaOutputState, uiVolumeToGain } from "@/applyMediaOutputState";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import { showMusicToast } from "./musicToast";
import type { OutsideTrack } from "./musicOutsideRecommend";
import { PREVIEW_SEC, type PreviewStream, previewStartSec, previewStreamFresh } from "./musicPreviewStream";

export type PreviewStatus = "loading" | "playing" | "paused";

/** A YouTube Music song streamed without downloading, or a library file played from disk. */
export type PreviewSource = { kind: "outside"; track: OutsideTrack } | { kind: "local"; file: MediaFile };

export function previewId(source: PreviewSource): string {
  return source.kind === "outside" ? `yt:${source.track.videoId}` : `file:${source.file.path}`;
}

export function previewTitle(source: PreviewSource): string {
  return source.kind === "outside" ? source.track.title : source.file.name;
}

type PreviewState = {
  id: string | null;
  status: PreviewStatus | null;
  /** 0..1 through the preview window. */
  progress: number;
};

export const useMusicPreview = create<PreviewState>(() => ({ id: null, status: null, progress: 0 }));

const cache = new Map<string, { stream: PreviewStream; at: number }>();
const nowSec = () => Math.floor(Date.now() / 1000);
const localHooks = new Map<string, number | null>();

/** A missing or unreadable sidecar just means the guessed start. */
async function localHookStart(path: string): Promise<number | null> {
  if (localHooks.has(path)) return localHooks.get(path) ?? null;
  const hook = await invoke<number | null>("music_preview_local_hook", { path }).catch(() => null);
  localHooks.set(path, hook);
  return hook;
}

async function resolveSrc(source: PreviewSource): Promise<{ src: string; hookStart: number | null }> {
  if (source.kind === "local") {
    return { src: convertFileSrc(source.file.path), hookStart: await localHookStart(source.file.path) };
  }
  const stream = await resolveStream(source.track);
  return { src: stream.url, hookStart: stream.hookStart };
}

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
/** Where the current preview's window begins, in song seconds. */
let windowStart = 0;

/** Scaled from the usual 2s in / 5s out on 30 to 60 second preview clips to fit a 15 second window. */
const FADE_IN_MS = 1000;
const FADE_OUT_SEC = 2;
/** Pause, stop and switching songs: long enough to kill the click, short enough to feel immediate. */
const FADE_QUICK_MS = 300;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
let ramp = { from: 0, to: 0, at: 0, ms: 0 };
let frame = 0;

function rampGain(now: number): number {
  const t = ramp.ms > 0 ? clamp01((now - ramp.at) / ramp.ms) : 1;
  return ramp.from + (ramp.to - ramp.from) * t;
}

function rampTo(to: number, ms: number) {
  const now = performance.now();
  ramp = { from: rampGain(now), to, at: now, ms };
  schedule();
}

/** Fades toward the end of the window, or the end of the song if that comes first. */
function tailGain(el: HTMLAudioElement): number {
  const songEnd = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
  const end = Math.min(windowStart + PREVIEW_SEC, songEnd);
  return clamp01((end - el.currentTime) / FADE_OUT_SEC);
}

function applyOutput(el: HTMLAudioElement, now = performance.now()) {
  const { volume, isMuted } = useRuforgeStore.getState();
  applyMediaOutputState(el, volume, isMuted);
  el.volume = uiVolumeToGain(volume) * rampGain(now) * tailGain(el);
}

// Per frame because timeupdate lands only about four times a second, which makes fades step audibly.
function tick() {
  frame = 0;
  const el = audio;
  if (!el) return;
  const now = performance.now();
  applyOutput(el, now);
  if (!el.paused || rampGain(now) !== ramp.to) schedule();
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(tick);
}

useRuforgeStore.subscribe((s, prev) => {
  if (audio && (s.volume !== prev.volume || s.isMuted !== prev.isMuted)) applyOutput(audio);
});

/** Lets a finished preview fade out on its own element while the next one loads on a fresh one. */
function fadeOutAndDrop(el: HTMLAudioElement) {
  const drop = () => {
    el.pause();
    el.removeAttribute("src");
    el.load();
  };
  if (el.paused || el.volume === 0) {
    drop();
    return;
  }
  const from = el.volume;
  const at = performance.now();
  const step = () => {
    const t = clamp01((performance.now() - at) / FADE_QUICK_MS);
    el.volume = from * (1 - t);
    if (t < 1) requestAnimationFrame(step);
    else drop();
  };
  requestAnimationFrame(step);
}

export function setMusicPreviewMainBridge(next: MainPlaybackBridge | null): void {
  bridge = next;
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const el = new Audio();
  el.preload = "auto";
  el.volume = 0;
  const current = () => audio === el;
  el.addEventListener("timeupdate", () => {
    if (!current()) return;
    const d = el.duration;
    const span = Number.isFinite(d) && d > 0 ? Math.min(PREVIEW_SEC, d - windowStart) : PREVIEW_SEC;
    const into = el.currentTime - windowStart;
    if (into >= PREVIEW_SEC) {
      stopMusicPreview();
      return;
    }
    useMusicPreview.setState({ progress: clamp01(into / span) });
  });
  el.addEventListener("playing", () => {
    if (!current()) return;
    if (useMusicPreview.getState().status === "loading") rampTo(1, FADE_IN_MS);
    useMusicPreview.setState({ status: "playing" });
    schedule();
  });
  el.addEventListener("ended", () => {
    if (current()) stopMusicPreview();
  });
  el.addEventListener("error", () => {
    if (!current()) return;
    const id = useMusicPreview.getState().id;
    if (!id) return;
    if (id.startsWith("yt:")) cache.delete(id.slice(3));
    stopMusicPreview();
    showMusicToast("Couldn't play the preview", "error");
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
    fadeOutAndDrop(audio);
    audio = null;
  }
  ramp = { from: 0, to: 0, at: 0, ms: 0 };
  if (useMusicPreview.getState().id) useMusicPreview.setState({ id: null, status: null, progress: 0 });
  if (opts.resumeMain === false) pausedMain = false;
  else releaseMain();
}

/** Play, pause or resume a song's preview. Starting one pauses the main player. */
export async function toggleMusicPreview(source: PreviewSource): Promise<void> {
  const { id: currentId, status } = useMusicPreview.getState();
  const id = previewId(source);
  const forget = () => {
    if (source.kind === "outside") cache.delete(source.track.videoId);
  };
  if (currentId === id && audio) {
    const el = audio;
    if (status === "playing") {
      useMusicPreview.setState({ status: "paused" });
      rampTo(0, FADE_QUICK_MS);
      window.setTimeout(() => {
        if (audio === el && useMusicPreview.getState().status === "paused") el.pause();
      }, FADE_QUICK_MS);
    } else if (status === "paused") {
      useMusicPreview.setState({ status: "playing" });
      rampTo(1, FADE_QUICK_MS);
      void el.play().catch(() => stopMusicPreview());
    } else {
      stopMusicPreview();
    }
    return;
  }

  const hadPausedMain = pausedMain;
  stopMusicPreview({ resumeMain: false });
  pausedMain = hadPausedMain;
  const el = ensureAudio();
  const mine = ++generation;
  if (!pausedMain && bridge?.playing()) {
    bridge.pause();
    pausedMain = true;
  }
  useMusicPreview.setState({ id, status: "loading", progress: 0 });
  try {
    const { src, hookStart } = await resolveSrc(source);
    if (mine !== generation) return;
    windowStart = 0;
    applyOutput(el);
    el.addEventListener(
      "loadedmetadata",
      () => {
        if (mine !== generation) return;
        windowStart = previewStartSec(el.duration, hookStart);
        el.currentTime = windowStart;
      },
      { once: true },
    );
    el.src = src;
    // A stream that never starts would otherwise leave the spinner up forever.
    window.setTimeout(() => {
      if (mine !== generation || useMusicPreview.getState().status !== "loading") return;
      forget();
      stopMusicPreview();
      showMusicToast("Couldn't play the preview", "error");
    }, LOAD_TIMEOUT_MS);
    await el.play();
  } catch {
    if (mine !== generation) return;
    forget();
    stopMusicPreview();
    showMusicToast("Couldn't play the preview", "error");
  }
}

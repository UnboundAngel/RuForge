import { onAnalyserGraphAcquired, peekAnalyserGraph } from "@/audioAnalyserGraph";
import {
  getPlaybackMediaElement,
  subscribePlaybackMediaElement,
} from "@/lib/playbackMediaElement";

export const AUDIO_OUTPUT_DEVICE_KEY = "ruforge-audio-output-device-id";

export type AudioOutputDevice = {
  deviceId: string;
  label: string;
};

type MediaElWithSink = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type AudioContextWithSink = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const listeners = new Set<() => void>();
const deviceListListeners = new Set<() => void>();
let bindingReady = false;
let cachedDevices: AudioOutputDevice[] = [];
let unlockAttempted = false;

function notify() {
  for (const fn of listeners) fn();
}

function notifyDeviceList() {
  for (const fn of deviceListListeners) fn();
}

export function getAudioOutputDeviceId(): string {
  try {
    return localStorage.getItem(AUDIO_OUTPUT_DEVICE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function subscribeAudioOutputDeviceId(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getCachedAudioOutputDevices(): AudioOutputDevice[] {
  return cachedDevices;
}

export function subscribeCachedAudioOutputDevices(onChange: () => void): () => void {
  deviceListListeners.add(onChange);
  return () => deviceListListeners.delete(onChange);
}

function isSelectableOutputId(deviceId: string): boolean {
  const id = deviceId.trim();
  if (!id) return false;
  if (id === "default" || id === "communications") return false;
  return true;
}

function mapOutputs(devices: MediaDeviceInfo[]): AudioOutputDevice[] {
  const outs = devices.filter((d) => d.kind === "audiooutput" && isSelectableOutputId(d.deviceId));
  return outs.map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label?.trim() || `Speaker ${i + 1}`,
  }));
}

/** Chromium hides output labels/ids until a media permission is granted. */
async function unlockOutputDeviceLabels(): Promise<void> {
  if (unlockAttempted || !navigator.mediaDevices?.getUserMedia) return;
  unlockAttempted = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of stream.getTracks()) track.stop();
  } catch {
    /* denied or unavailable — keep whatever enumerateDevices returns */
  }
}

export async function listAudioOutputDevices(options?: {
  /** Attempt mic permission once so Chromium exposes labeled outputs. Default true. */
  unlock?: boolean;
}): Promise<AudioOutputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let mapped = mapOutputs(devices);
    const needsUnlock =
      options?.unlock !== false &&
      (mapped.length === 0 || mapped.every((d) => /^Speaker \d+$/.test(d.label)));
    if (needsUnlock) {
      await unlockOutputDeviceLabels();
      devices = await navigator.mediaDevices.enumerateDevices();
      mapped = mapOutputs(devices);
    }
    cachedDevices = mapped;
    notifyDeviceList();
    return mapped;
  } catch {
    return [];
  }
}

export function subscribeAudioOutputDeviceChange(onChange: () => void): () => void {
  if (!navigator.mediaDevices?.addEventListener) return () => {};
  const handler = () => {
    void listAudioOutputDevices({ unlock: false }).then(() => onChange());
  };
  navigator.mediaDevices.addEventListener("devicechange", handler);
  return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
}

async function applySinkToElement(el: HTMLMediaElement, deviceId: string): Promise<void> {
  const media = el as MediaElWithSink;
  if (typeof media.setSinkId !== "function") return;
  try {
    await media.setSinkId(deviceId);
  } catch {
    if (deviceId !== "") {
      try {
        await media.setSinkId("");
      } catch {
        /* ignore */
      }
    }
  }
}

async function applySinkToAnalyser(el: HTMLMediaElement, deviceId: string): Promise<void> {
  const graph = peekAnalyserGraph(el);
  if (!graph) return;
  const ctx = graph.ctx as AudioContextWithSink;
  if (typeof ctx.setSinkId !== "function") return;
  try {
    await ctx.setSinkId(deviceId);
  } catch {
    if (deviceId !== "") {
      try {
        await ctx.setSinkId("");
      } catch {
        /* ignore */
      }
    }
  }
}

export async function applyAudioOutputSink(
  el: HTMLMediaElement | null,
  deviceId: string = getAudioOutputDeviceId(),
): Promise<void> {
  if (!el) return;
  await Promise.all([applySinkToElement(el, deviceId), applySinkToAnalyser(el, deviceId)]);
}

export async function applyStoredAudioOutputSink(
  el: HTMLMediaElement | null = getPlaybackMediaElement(),
): Promise<void> {
  await applyAudioOutputSink(el, getAudioOutputDeviceId());
}

export function setAudioOutputDeviceId(deviceId: string): void {
  const next = typeof deviceId === "string" ? deviceId : "";
  try {
    if (next === "") localStorage.removeItem(AUDIO_OUTPUT_DEVICE_KEY);
    else localStorage.setItem(AUDIO_OUTPUT_DEVICE_KEY, next);
  } catch {
    /* ignore */
  }
  notify();
  void applyStoredAudioOutputSink(getPlaybackMediaElement());
}

/** Wire re-apply when the main media element or analyser graph changes. Idempotent. */
export function ensureAudioOutputSinkBinding(): void {
  if (bindingReady) return;
  bindingReady = true;
  subscribePlaybackMediaElement(() => {
    void applyStoredAudioOutputSink(getPlaybackMediaElement());
  });
  onAnalyserGraphAcquired((el) => {
    void applyStoredAudioOutputSink(el);
  });
  void applyStoredAudioOutputSink(getPlaybackMediaElement());
  void listAudioOutputDevices({ unlock: false });
}

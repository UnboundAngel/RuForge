import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { type PreviewStream, previewStreamFresh } from "@/components/music/musicPreviewStream";
import { VIDEO_PREVIEW_SEC, feedCookieSource, videoPreviewStartSec, type FeedVideo } from "./youtubeFeed";

export type FeedPreviewStatus = "loading" | "playing" | "paused";

const LOAD_TIMEOUT_MS = 20_000;

type FeedPreviewState = {
  id: string | null;
  status: FeedPreviewStatus | null;
  src: string | null;
  start: number;
  /** 0..1 through the preview window. */
  progress: number;
  muted: boolean;
};

export const useFeedPreview = create<FeedPreviewState>(() => ({
  id: null,
  status: null,
  src: null,
  start: 0,
  progress: 0,
  muted: false,
}));

const cache = new Map<string, { stream: PreviewStream; at: number }>();
const CACHE_LIMIT = 32;
const nowSec = () => Math.floor(Date.now() / 1000);
/** Bumped on every start and stop so a slow lookup can't start a video the user moved past. */
let generation = 0;

function remember(videoId: string, stream: PreviewStream) {
  cache.delete(videoId);
  cache.set(videoId, { stream, at: nowSec() });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

async function resolveStream(video: FeedVideo): Promise<PreviewStream> {
  const hit = cache.get(video.videoId);
  if (hit && previewStreamFresh(hit.stream, hit.at, nowSec())) return hit.stream;
  const s = useRuforgeStore.getState();
  const cookies = feedCookieSource(s.settings, s.youtubeSessionStatus);
  const stream = await invoke<PreviewStream>("resolve_video_preview_stream", {
    url: video.url,
    browserCookies: cookies?.browserCookies ?? null,
    cookieFile: cookies?.cookieFile ?? null,
  });
  remember(video.videoId, stream);
  return stream;
}

export function stopFeedPreview(): void {
  generation++;
  if (useFeedPreview.getState().id) {
    useFeedPreview.setState({ id: null, status: null, src: null, start: 0, progress: 0 });
  }
}

export function failFeedPreview(videoId: string): void {
  if (useFeedPreview.getState().id !== videoId) return;
  cache.delete(videoId);
  stopFeedPreview();
  useRuforgeStore.getState().notify("Couldn't play the preview");
}

export function setFeedPreviewMuted(muted: boolean): void {
  useFeedPreview.setState({ muted });
}

/** Play, pause or resume a feed video's preview; starting one ends any other. */
export async function toggleFeedPreview(video: FeedVideo): Promise<void> {
  const { id, status } = useFeedPreview.getState();
  if (id === video.videoId) {
    if (status === "playing") useFeedPreview.setState({ status: "paused" });
    else if (status === "paused") useFeedPreview.setState({ status: "playing" });
    else stopFeedPreview();
    return;
  }
  stopFeedPreview();
  const mine = ++generation;
  useFeedPreview.setState({ id: video.videoId, status: "loading", src: null, start: 0, progress: 0 });
  window.setTimeout(() => {
    if (mine === generation && useFeedPreview.getState().status === "loading") failFeedPreview(video.videoId);
  }, LOAD_TIMEOUT_MS);
  try {
    const stream = await resolveStream(video);
    if (mine !== generation) return;
    const duration = stream.duration ?? video.duration;
    useFeedPreview.setState({ src: stream.url, start: videoPreviewStartSec(duration, stream.hookStart) });
  } catch {
    if (mine === generation) failFeedPreview(video.videoId);
  }
}

/** The card's `<video>` reports where it is; the window closes itself at the end. */
export function reportFeedPreviewTime(videoId: string, currentTime: number, duration: number): void {
  const { id, start } = useFeedPreview.getState();
  if (id !== videoId) return;
  const span = Number.isFinite(duration) && duration > 0 ? Math.min(VIDEO_PREVIEW_SEC, duration - start) : VIDEO_PREVIEW_SEC;
  const into = currentTime - start;
  if (into >= span) {
    stopFeedPreview();
    return;
  }
  useFeedPreview.setState({ progress: Math.max(0, Math.min(1, into / span)) });
}

import { create } from "zustand";
import type { MediaFile } from "../../types";
import { useRuforgeStore } from "../../store/ruforgeStore";
import {
  EMPTY_VIDEO_QUEUE,
  queueAdd,
  queueOnStarted,
  queuePlayNext,
  queueRemove,
  type VideoQueueState,
} from "./logic";

export { nextVideo, previousVideo, videoEndPlan, type VideoQueueState } from "./logic";

/** Video up-next queue. Lives for the session and stays apart from the Music queue. */
export const useVideoQueueStore = create<VideoQueueState>(() => EMPTY_VIDEO_QUEUE);

const update = (fn: (s: VideoQueueState) => VideoQueueState) =>
  useVideoQueueStore.setState((s) => fn({ items: s.items, resumeAfter: s.resumeAfter }));

/** Queue a video to play right after the current one, ahead of anything queued earlier. */
export function playNext(file: MediaFile): void {
  update((s) => queuePlayNext(s, file));
  useRuforgeStore.getState().notify(`Playing next: ${file.name}`);
}

/** Queue a video behind the ones already queued. */
export function addToQueue(file: MediaFile): void {
  update((s) => queueAdd(s, file));
  useRuforgeStore.getState().notify(`Added to queue: ${file.name}`);
}

export function removeFromVideoQueue(file: MediaFile): void {
  update((s) => queueRemove(s, file));
}

export function clearVideoQueue(): void {
  useVideoQueueStore.setState(EMPTY_VIDEO_QUEUE, true);
}

/** Called when any video starts: drops it from the queue and tracks what the queue interrupted. */
export function noteVideoStarted(file: MediaFile, previous: MediaFile | null): void {
  update((s) => queueOnStarted(s, file, previous));
}

/** First hand-queued video that is not `file` itself. */
export function nextQueuedVideo(file: MediaFile): MediaFile | null {
  return useVideoQueueStore.getState().items.find((f) => f.path !== file.path) ?? null;
}

export function useVideoQueue(): readonly MediaFile[] {
  return useVideoQueueStore((s) => s.items);
}

/** Hooks-free snapshot for key handlers and end-of-video callbacks. */
export function getVideoQueueState(): VideoQueueState {
  const { items, resumeAfter } = useVideoQueueStore.getState();
  return { items, resumeAfter };
}

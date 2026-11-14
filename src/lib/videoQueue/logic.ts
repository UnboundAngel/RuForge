import type { MediaFile } from "../../types";
import { playlistEndSuggestions } from "../playlistPlayback";

export type VideoQueueState = {
  /** Hand-queued videos, played before the playlist or Next-up order resumes. */
  items: MediaFile[];
  /** The ordered-list video that was playing when queued videos took over; the order resumes after it. */
  resumeAfter: MediaFile | null;
};

export const EMPTY_VIDEO_QUEUE: VideoQueueState = { items: [], resumeAfter: null };

const samePath = (a: MediaFile, b: MediaFile) => a.path === b.path;

/** Front of the queue. A video already queued moves instead of doubling. */
export function queuePlayNext(state: VideoQueueState, file: MediaFile): VideoQueueState {
  return { ...state, items: [file, ...state.items.filter((f) => !samePath(f, file))] };
}

/** Back of the queue; a video already queued keeps its place. */
export function queueAdd(state: VideoQueueState, file: MediaFile): VideoQueueState {
  if (state.items.some((f) => samePath(f, file))) return state;
  return { ...state, items: [...state.items, file] };
}

export function queueRemove(state: VideoQueueState, file: MediaFile): VideoQueueState {
  const items = state.items.filter((f) => !samePath(f, file));
  return items.length === state.items.length ? state : { ...state, items };
}

/**
 * A video started playing. A queued one leaves the queue and remembers what it interrupted;
 * anything else is the ordered list moving on by itself, so the memory resets.
 */
export function queueOnStarted(
  state: VideoQueueState,
  file: MediaFile,
  previous: MediaFile | null,
): VideoQueueState {
  if (state.items.some((f) => samePath(f, file))) {
    const resumeAfter = state.resumeAfter ?? previous;
    return { items: state.items.filter((f) => !samePath(f, file)), resumeAfter };
  }
  return state.resumeAfter ? { ...state, resumeAfter: null } : state;
}

function anchorIndex(file: MediaFile, order: readonly MediaFile[], resumeAfter: MediaFile | null): number {
  const i = order.findIndex((f) => samePath(f, file));
  if (i >= 0 || !resumeAfter) return i;
  return order.findIndex((f) => samePath(f, resumeAfter));
}

/** The video after `file`: queued videos first, then the order from where the queue interrupted. */
export function nextVideo(
  file: MediaFile,
  order: readonly MediaFile[],
  state: VideoQueueState,
): MediaFile | null {
  const queued = state.items.find((f) => !samePath(f, file));
  if (queued) return queued;
  const i = anchorIndex(file, order, state.resumeAfter);
  return i >= 0 && i < order.length - 1 ? order[i + 1]! : null;
}

export function previousVideo(
  file: MediaFile,
  order: readonly MediaFile[],
  state: VideoQueueState,
): MediaFile | null {
  const i = anchorIndex(file, order, state.resumeAfter);
  return i > 0 ? order[i - 1]! : null;
}

/**
 * End screen cards and whether the countdown autoplays. Null means no queue or playlist is
 * involved, so the caller keeps its library suggestions and the audio auto-advance setting.
 */
export function videoEndPlan(
  file: MediaFile,
  order: readonly MediaFile[],
  inPlaylist: boolean,
  state: VideoQueueState,
): { suggestions: MediaFile[]; autoplay: boolean } | null {
  const queued = state.items.filter((f) => !samePath(f, file));
  if (queued.length > 0) return { suggestions: queued.slice(0, 2), autoplay: true };
  if (inPlaylist) return playlistEndSuggestions(file, order);
  const i = state.resumeAfter ? anchorIndex(file, order, state.resumeAfter) : -1;
  if (i >= 0 && i < order.length - 1) return { suggestions: order.slice(i + 1, i + 3), autoplay: true };
  return null;
}

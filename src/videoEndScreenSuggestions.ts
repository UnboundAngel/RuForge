import { isVideoWatched } from "./playbackStorage";
import type { MediaFile } from "./types";

export const VIDEO_END_SCREEN_COUNTDOWN_SEC = 12;
/** End cards appear for this fraction of duration, clamped to min/max seconds. */
export const VIDEO_END_CARDS_LEAD_RATIO = 0.05;
export const VIDEO_END_CARDS_LEAD_MIN_SEC = 2;
export const VIDEO_END_CARDS_LEAD_MAX_SEC = 10;
export const VIDEO_END_FADE_SEC = 5;
/** Mild dim while end cards are up; hover only bumps slightly so the video stays readable. */
export const VIDEO_END_CARDS_DIM = 0.1;
export const VIDEO_END_CARDS_HOVER_DIM = 0.16;

/** Seconds before end when suggestion cards appear (2–10s from % of duration). */
export function videoEndCardsLeadSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return VIDEO_END_CARDS_LEAD_MIN_SEC;
  }
  return Math.min(
    VIDEO_END_CARDS_LEAD_MAX_SEC,
    Math.max(VIDEO_END_CARDS_LEAD_MIN_SEC, durationSec * VIDEO_END_CARDS_LEAD_RATIO),
  );
}

/** Fade window cannot exceed the cards lead window (short videos). */
export function videoEndFadeSec(durationSec: number): number {
  return Math.min(VIDEO_END_FADE_SEC, videoEndCardsLeadSec(durationSec));
}

/** 0 at fade start, 1 at end (remaining <= 0). */
export function endScreenFadeProgress(
  remainingSec: number,
  fadeSec: number = VIDEO_END_FADE_SEC,
): number {
  if (fadeSec <= 0) return remainingSec <= 0 ? 1 : 0;
  if (remainingSec >= fadeSec) return 0;
  if (remainingSec <= 0) return 1;
  return 1 - remainingSec / fadeSec;
}

/** Audio gain multiplier during end fade (1 → 0). */
export function endScreenFadeGain(
  remainingSec: number,
  fadeSec: number = VIDEO_END_FADE_SEC,
): number {
  return 1 - endScreenFadeProgress(remainingSec, fadeSec);
}

function shuffleInPlace<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * Pick up to 2 video end-screen suggestions: unwatched first, then random watched.
 * Never includes the current path.
 */
export function pickVideoEndScreenSuggestions(
  currentPath: string,
  library: MediaFile[],
  limit = 2,
  random: () => number = Math.random,
): MediaFile[] {
  if (limit <= 0) return [];
  const candidates = library.filter((f) => f.path !== currentPath);
  if (candidates.length === 0) return [];

  const unwatched: MediaFile[] = [];
  const watched: MediaFile[] = [];
  for (const file of candidates) {
    if (isVideoWatched(file.path, file.duration)) {
      watched.push(file);
    } else {
      unwatched.push(file);
    }
  }

  shuffleInPlace(unwatched, random);
  shuffleInPlace(watched, random);

  const picked: MediaFile[] = [];
  for (const file of unwatched) {
    if (picked.length >= limit) break;
    picked.push(file);
  }
  for (const file of watched) {
    if (picked.length >= limit) break;
    picked.push(file);
  }
  return picked;
}

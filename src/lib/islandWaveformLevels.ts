import {
  acquireAnalyserGraph,
  readIslandBandLevels,
  releaseAnalyserGraph,
  type AnalyserGraph,
} from "@/audioAnalyserGraph";
import {
  getPlaybackMediaElement,
  subscribePlaybackMediaElement,
} from "@/lib/playbackMediaElement";

export const ISLAND_WAVEFORM_BAR_COUNT = 5;

const IDLE_LEVEL = 0.18;

/**
 * Spring-damper physics for bar motion (Apple's "shoot up on attack, float
 * down with inertia" feel) instead of a flat lerp. Critically-damped-ish:
 * high stiffness gives a fast attack, lower damping lets a beat slightly
 * overshoot and settle rather than snapping straight to target.
 */
const SPRING_STIFFNESS = 360;
const SPRING_DAMPING = 18;
const SPRING_DT = 1 / 60;

const levels: number[] = Array.from({ length: ISLAND_WAVEFORM_BAR_COUNT }, () => IDLE_LEVEL);
const velocities: number[] = Array.from({ length: ISLAND_WAVEFORM_BAR_COUNT }, () => 0);
const bandScratch: number[] = Array.from({ length: ISLAND_WAVEFORM_BAR_COUNT }, () => 0);
const listeners = new Set<() => void>();

/**
 * Snapshot returned to `useSyncExternalStore`. `levels` is mutated in place
 * every tick, so a stable reference would make `Object.is` see "no change"
 * and the subscriber would never re-render. Replaced with a fresh array
 * whenever `notify()` fires.
 */
let levelsSnapshot: readonly number[] = [...levels];

let rafId: number | null = null;
let subscriberCount = 0;
let mediaUnsub: (() => void) | null = null;
let graph: AnalyserGraph | null = null;
let graphEl: HTMLMediaElement | null = null;
let inactive = true;

function notify() {
  levelsSnapshot = [...levels];
  for (const fn of listeners) fn();
}

/** Advances `levels[i]` toward `target` via spring-damper physics; returns whether it moved. */
function springStep(i: number, target: number): boolean {
  const accel = SPRING_STIFFNESS * (target - levels[i]) - SPRING_DAMPING * velocities[i];
  velocities[i] += accel * SPRING_DT;
  const next = levels[i] + velocities[i] * SPRING_DT;
  const moved = Math.abs(next - levels[i]) > 0.0005 || Math.abs(velocities[i]) > 0.0005;
  levels[i] = next;
  return moved;
}

/** Returns whether the bars are still settling. */
function decayToIdle(): boolean {
  let changed = false;
  for (let i = 0; i < ISLAND_WAVEFORM_BAR_COUNT; i++) {
    if (springStep(i, IDLE_LEVEL)) changed = true;
  }
  if (changed) notify();
  return changed;
}

function resetGraphForMediaChange() {
  if (graphEl) {
    releaseAnalyserGraph(graphEl, true);
  }
  graphEl = null;
  graph = null;
}

function ensureGraph(el: HTMLMediaElement) {
  if (graphEl !== el) {
    resetGraphForMediaChange();
    graphEl = el;
  }
  if (!graph || graph.ctx.state === "closed") {
    graph = acquireAnalyserGraph(el);
  }
  if (graph?.ctx.state === "suspended") void graph.ctx.resume();
}

function bindMediaRetryListeners(el: HTMLMediaElement | null) {
  if (!el) return;
  const retry = () => {
    wakeLoop();
    if (inactive || el.paused) return;
    if (!graph || graph.ctx.state === "closed") {
      resetGraphForMediaChange();
      graphEl = el;
      graph = acquireAnalyserGraph(el);
      if (graph) void graph.ctx.resume();
      notify();
    }
  };
  el.addEventListener("play", retry);
  el.addEventListener("playing", retry);
  el.addEventListener("canplay", retry);
  el.addEventListener("loadeddata", retry);
  return () => {
    el.removeEventListener("play", retry);
    el.removeEventListener("playing", retry);
    el.removeEventListener("canplay", retry);
    el.removeEventListener("loadeddata", retry);
  };
}

let unbindMediaRetry: (() => void) | null = null;
let bgPumpId: ReturnType<typeof setInterval> | null = null;

/** Returns whether another frame is needed; false once paused and settled. */
function tickOnce(): boolean {
  const el = getPlaybackMediaElement();
  if (inactive || !el || el.paused) {
    return decayToIdle();
  }

  ensureGraph(el);
  if (!graph) {
    return decayToIdle();
  }

  const volGain = el.muted ? 0 : el.volume;
  const gain = (0.95 + volGain * 0.45) * (el.muted ? 0.15 : 1);
  readIslandBandLevels(graph, bandScratch, gain);

  let changed = false;
  for (let i = 0; i < ISLAND_WAVEFORM_BAR_COUNT; i++) {
    const target = IDLE_LEVEL + bandScratch[i] * (1 - IDLE_LEVEL);
    if (springStep(i, target)) changed = true;
  }
  if (changed) notify();
  return true;
}

let lastTickAt = 0;
/** A hair under one 60 Hz frame so a 120 Hz display still lands every other frame. */
const MIN_TICK_MS = SPRING_DT * 1000 - 2;

function tick(now: number) {
  rafId = null;
  // High-refresh displays would otherwise run the 1/60 s spring several times per frame
  // and re-render the island at the monitor rate.
  if (now - lastTickAt >= MIN_TICK_MS) {
    lastTickAt = now;
    // Paused and settled: park until play, a media swap, or reactivation wakes the loop.
    if (!tickOnce()) return;
  }
  rafId = requestAnimationFrame(tick);
}

function startLoop() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(tick);
}

function wakeLoop() {
  if (mediaUnsub != null) startLoop();
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  resetGraphForMediaChange();
  for (let i = 0; i < ISLAND_WAVEFORM_BAR_COUNT; i++) {
    levels[i] = IDLE_LEVEL;
    velocities[i] = 0;
  }
}

/**
 * Minimized / hidden main freezes rAF. Keep sampling the analyser on an
 * interval so the desktop island overlay still receives live levels.
 */
export function setIslandWaveformBackgroundPump(on: boolean) {
  if (on) {
    if (bgPumpId != null) return;
    bgPumpId = setInterval(() => {
      tickOnce();
    }, 48);
    tickOnce();
    return;
  }
  if (bgPumpId != null) {
    clearInterval(bgPumpId);
    bgPumpId = null;
  }
}

export function setIslandWaveformInactive(nextInactive: boolean) {
  if (inactive === nextInactive) return;
  inactive = nextInactive;
  if (inactive) decayToIdle();
  else notify();
  wakeLoop();
}

export function getIslandWaveformLevels(): readonly number[] {
  return levelsSnapshot;
}

/** Compact and expanded island swap waveform leaves; tearing down per swap would rebuild the analyser graph. */
const TEARDOWN_GRACE_MS = 1000;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

function teardown() {
  teardownTimer = null;
  if (subscriberCount !== 0) return;
  mediaUnsub?.();
  mediaUnsub = null;
  unbindMediaRetry?.();
  unbindMediaRetry = null;
  stopLoop();
  levelsSnapshot = [...levels];
}

export function subscribeIslandWaveformLevels(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  subscriberCount += 1;

  if (teardownTimer != null) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }

  if (subscriberCount === 1 && mediaUnsub == null) {
    mediaUnsub = subscribePlaybackMediaElement(() => {
      const nextEl = getPlaybackMediaElement();
      unbindMediaRetry?.();
      unbindMediaRetry = bindMediaRetryListeners(nextEl) ?? null;
      if (nextEl !== graphEl) resetGraphForMediaChange();
      notify();
      wakeLoop();
    });
    const initialEl = getPlaybackMediaElement();
    unbindMediaRetry = bindMediaRetryListeners(initialEl) ?? null;
    startLoop();
  }

  return () => {
    listeners.delete(onStoreChange);
    subscriberCount -= 1;
    if (subscriberCount === 0 && teardownTimer == null) {
      teardownTimer = setTimeout(teardown, TEARDOWN_GRACE_MS);
    }
  };
}

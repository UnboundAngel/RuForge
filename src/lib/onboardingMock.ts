/**
 * Which onboarding step currently wants demo content on screen. The flow sets it,
 * views read it. Never persisted, so a crash or restart cannot leave mock data behind.
 */

export type OnboardingMockKind = "video-playlists";

type MockState = {
  kind: OnboardingMockKind | null;
  /** True while the demo content animates out after the step ends. */
  leaving: boolean;
  /** Debug preview shows the demo even when the user has real data. */
  forced: boolean;
};

let state: MockState = { kind: null, leaving: false, forced: false };
const listeners = new Set<() => void>();
const cleanups = new Set<() => void>();
/** Kinds the debug preview wants shown even over real data; sticks across restarts of the mock until it is cleared. */
const pendingForce = new Set<OnboardingMockKind>();
/** Backstop for when no view is mounted to play the fade and clear the mock. */
const LEAVE_BACKSTOP_MS = 2500;
/** A demo page the user is still reading outlives the tour end by this long unless they leave first. */
const LEAVE_HELD_MS = 8000;
const holds = new Set<() => boolean>();
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: MockState): void {
  state = next;
  for (const l of listeners) l();
}

export function getOnboardingMock(): MockState {
  return state;
}

export function subscribeOnboardingMock(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Views register what must be undone when the mock goes away (a selected demo page, say). */
export function onOnboardingMockCleared(fn: () => void): () => void {
  cleanups.add(fn);
  return () => {
    cleanups.delete(fn);
  };
}

/** A view the user is still on keeps the demo alive past the tour end (see LEAVE_HELD_MS). */
export function registerOnboardingMockHold(fn: () => boolean): () => void {
  holds.add(fn);
  return () => {
    holds.delete(fn);
  };
}

/** The held page was left: the usual short fade window applies from now. */
export function releaseOnboardingMockHold(): void {
  if (state.leaving) armLeaveBackstop(LEAVE_BACKSTOP_MS);
}

/** Debug preview: the next start of this kind shows the demo regardless of the user's data. */
export function forceNextOnboardingMock(kind: OnboardingMockKind): void {
  pendingForce.add(kind);
}

export function startOnboardingMock(kind: OnboardingMockKind, forced = pendingForce.has(kind)): void {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = null;
  set({ kind, leaving: false, forced });
}

/** Views fade the demo out, then call `clearOnboardingMock` once their exit animation ends. */
export function endOnboardingMock(): void {
  if (!state.kind) return;
  set({ ...state, leaving: true });
  armLeaveBackstop([...holds].some((h) => h()) ? LEAVE_HELD_MS : LEAVE_BACKSTOP_MS);
}

function armLeaveBackstop(ms: number): void {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    leaveTimer = null;
    if (state.leaving) clearOnboardingMock();
  }, ms);
}

export function clearOnboardingMock(): void {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = null;
  pendingForce.clear();
  for (const fn of cleanups) fn();
  set({ kind: null, leaving: false, forced: false });
}

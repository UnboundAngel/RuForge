import { flushActivityLog, initActivityLog, recordActivity } from "./activityLog";

const IDLE_MS = 5 * 60 * 1000;

/** One start/end pair per app launch (survives React Strict Mode remounts and HMR). */
type LaunchSession = {
  open: boolean;
  activeMs: number;
  sliceStart: number | null;
  lastInput: number;
  focused: boolean;
};

let launch: LaunchSession | null = null;

function ensureLaunch(): LaunchSession {
  if (!launch) {
    launch = {
      open: false,
      activeMs: 0,
      sliceStart: null,
      lastInput: Date.now(),
      focused: false,
    };
  }
  return launch;
}

function accumulate(s: LaunchSession) {
  if (s.sliceStart == null) return;
  s.activeMs += Math.max(0, Date.now() - s.sliceStart);
  s.sliceStart = null;
}

function maybeStartSlice(s: LaunchSession) {
  const idle = Date.now() - s.lastInput >= IDLE_MS;
  if (s.focused && !idle && s.sliceStart == null) s.sliceStart = Date.now();
  if (idle || !s.focused) accumulate(s);
}

/** Write app_session_start once for this process load. */
export function beginAppActivitySession(): void {
  initActivityLog();
  const s = ensureLaunch();
  if (s.open) return;
  s.open = true;
  s.activeMs = 0;
  s.sliceStart = null;
  recordActivity({ kind: "app_session_start" });
  maybeStartSlice(s);
}

/** End on pagehide / real quit only (not effect cleanup). */
export function endAppActivitySession(): void {
  const s = launch;
  if (!s?.open) return;
  accumulate(s);
  const minutes = Math.max(0, Math.round(s.activeMs / 60_000));
  recordActivity({ kind: "app_session_end", activeMinutes: minutes });
  void flushActivityLog();
  s.open = false;
  s.activeMs = 0;
  s.sliceStart = null;
}

export function noteAppActivityFocus(focused: boolean): void {
  const s = ensureLaunch();
  s.focused = focused;
  maybeStartSlice(s);
}

export function noteAppActivityInput(): void {
  const s = ensureLaunch();
  s.lastInput = Date.now();
  maybeStartSlice(s);
}

export function tickAppActivityIdle(): void {
  maybeStartSlice(ensureLaunch());
}

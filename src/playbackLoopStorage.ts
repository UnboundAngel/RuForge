export type LoopMode = "off" | "all" | "one";

const LOOP_KEY_PREFIX = "ruforge-loop:";

export function parseLoopMode(raw: string | null | undefined): LoopMode {
  if (raw === "all" || raw === "one" || raw === "off") return raw;
  if (raw === "true") return "one";
  return "off";
}

export function cycleLoopMode(mode: LoopMode): LoopMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}

export function readLoopModeForPath(path: string): LoopMode {
  return parseLoopMode(localStorage.getItem(`${LOOP_KEY_PREFIX}${path}`));
}

export function writeLoopModeForPath(path: string, mode: LoopMode): void {
  if (mode === "all") {
    localStorage.removeItem(`${LOOP_KEY_PREFIX}${path}`);
    return;
  }
  localStorage.setItem(`${LOOP_KEY_PREFIX}${path}`, mode);
}

export function clearLoopForPath(path: string): void {
  localStorage.removeItem(`${LOOP_KEY_PREFIX}${path}`);
}

export function resolveLoopModeForPlay(
  pathMode: LoopMode,
  sessionMode: LoopMode,
): LoopMode {
  if (pathMode === "one") return "one";
  if (sessionMode === "all") return "all";
  return "off";
}

/** Exclusive end of the user-chosen span; idle endless tail starts here when set. */
export function musicUserLoopEndIndex(
  playlistLength: number,
  endlessFromIndex: number | null,
): number {
  if (endlessFromIndex == null) return Math.max(0, playlistLength);
  return Math.max(0, Math.min(endlessFromIndex, playlistLength));
}

export function loopModeIcon(mode: LoopMode): string {
  if (mode === "one") return "lucide:repeat-1";
  if (mode === "all") return "streamline:arrow-infinite-loop";
  return "radix-icons:loop";
}

export function loopModeAriaLabel(mode: LoopMode): string {
  if (mode === "one") return "Loop one";
  if (mode === "all") return "Loop all";
  return "Loop off";
}

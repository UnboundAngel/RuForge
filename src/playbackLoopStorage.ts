/** Per-video loop preference (mini + main share via path key). */
const LOOP_KEY_PREFIX = "ruforge-loop:";

export function readLoopForPath(videoPath: string): boolean {
  return localStorage.getItem(`${LOOP_KEY_PREFIX}${videoPath}`) === "true";
}

export function writeLoopForPath(videoPath: string, loop: boolean): void {
  localStorage.setItem(`${LOOP_KEY_PREFIX}${videoPath}`, loop.toString());
}

export function clearLoopForPath(videoPath: string): void {
  localStorage.removeItem(`${LOOP_KEY_PREFIX}${videoPath}`);
}

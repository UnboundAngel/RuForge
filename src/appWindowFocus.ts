/** Shared foreground state for main + mini windows (updated from each webview). */

let mainWindowFocused = true;
let miniWindowFocused = false;

export function setMainWindowFocused(focused: boolean): void {
  mainWindowFocused = focused;
}

export function setMiniWindowFocused(focused: boolean): void {
  miniWindowFocused = focused;
}

/** True when the user is actively in RuForge (main or mini), not alt-tabbed away. */
export function isRuforgeAppInForeground(): boolean {
  if (mainWindowFocused || miniWindowFocused) return true;
  if (typeof document !== "undefined" && document.hasFocus()) return true;
  return false;
}

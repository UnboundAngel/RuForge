export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function modKeyLabel(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

export function altKeyLabel(): string {
  return isMacPlatform() ? "⌥" : "Alt";
}

export function downloadShortcutLabel(): string {
  return `${modKeyLabel()}+D`;
}

/** Cmd on macOS, Ctrl elsewhere, with the other one up so Ctrl+key stays free for macOS text fields. */
export function isPrimaryModifierOnly(e: {
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

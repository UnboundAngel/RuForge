import { downloadDir, homeDir, join } from "@tauri-apps/api/path";

/** WebView user agent; good enough for default path heuristics before Tauri path APIs run. */
export function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Windows/i.test(navigator.userAgent);
}

export let DEFAULT_OUTPUT_DIR = isWindowsPlatform() ? "C:\\Downloads" : "";

export let RUFORGE_INTERNAL_DIR = isWindowsPlatform() ? "C:\\RuForge\\Media" : "";

const WINDOWS_DEFAULT_OUTPUT = "C:\\Downloads";

/** True when persisted output path is still the Windows factory default on a non-Windows host. */
export function shouldReplaceStaleWindowsOutputDir(saved: string | null): boolean {
  if (isWindowsPlatform()) return false;
  if (!saved || !saved.trim()) return true;
  return /^[A-Za-z]:\\/.test(saved.replace(/\//g, "\\"));
}

/**
 * Resolve OS download + internal media dirs via Tauri path APIs and update module defaults.
 * Call once on main window startup.
 */
export async function hydratePlatformDefaultPaths(): Promise<{
  outputDir: string;
  internalDir: string;
}> {
  if (isWindowsPlatform()) {
    return { outputDir: DEFAULT_OUTPUT_DIR, internalDir: RUFORGE_INTERNAL_DIR };
  }
  const dl = await downloadDir();
  const internal = await join(await homeDir(), "RuForge", "Media");
  DEFAULT_OUTPUT_DIR = dl;
  RUFORGE_INTERNAL_DIR = internal;
  return { outputDir: dl, internalDir: internal };
}

export function windowsFactoryOutputDir(): string {
  return WINDOWS_DEFAULT_OUTPUT;
}

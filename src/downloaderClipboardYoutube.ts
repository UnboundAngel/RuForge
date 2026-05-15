import { readText } from "@tauri-apps/plugin-clipboard-manager";

import { extractYouTubeUrlFromText } from "./youtubeUrl";

/**
 * Clipboard scope: we read the OS **current** plain-text clipboard on downloader URL
 * focus only (`readText` via @tauri-apps/plugin-clipboard-manager). There is no stable
 * public API for Windows Clipboard History (Win+V) or older stack entries — typical
 * desktop apps cannot enumerate past clips without undocumented platform hooks.
 */

/** Read system clipboard as plain text; permission errors and empty clipboards are silent. */
export async function readSystemClipboardText(): Promise<string> {
  try {
    return await readText();
  } catch {
    return "";
  }
}

/** Latest clipboard YouTube watch URL at read time, or null. */
export async function readClipboardYouTubeUrl(): Promise<string | null> {
  const text = (await readSystemClipboardText()).trim();
  if (!text) return null;
  return extractYouTubeUrlFromText(text);
}

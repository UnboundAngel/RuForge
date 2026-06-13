import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { ActivityMiniTeardownPayload } from "@/lib/activityTypes";

/** Tell music-mini to release playback so main can claim (idempotent when mini is idle). */
export function stopMusicMiniForMainClaim(): void {
  void emitTo("music-mini", "stop-music-mini-playback", "main-app").catch(() => null);
}

export async function closeVideoMiniWindow(): Promise<void> {
  try {
    const mini = await WebviewWindow.getByLabel("mini");
    if (!mini) return;
    try {
      await mini.close();
    } catch (e) {
      console.error("Failed to close mini player", e);
    }
  } catch {
    /* not in Tauri */
  }
}

/** Pause + close both minis so main can claim. Sync entry; video close is async. */
export function claimMainPlayback(): void {
  stopMusicMiniForMainClaim();
  void emitTo("mini", "stop-playback", "main-app").catch(() => null);
  void closeVideoMiniWindow();
}

/** Stop and close the video mini window when main claims playback. */
export async function stopVideoMiniForMainClaim(): Promise<void> {
  void emitTo("mini", "stop-playback", "main-app").catch(() => null);
  await closeVideoMiniWindow();
}

export function emitVideoMiniTeardown(): void {
  const payload: ActivityMiniTeardownPayload = { surface: "video-mini" };
  void emitTo("main", "activity-mini-teardown", payload).catch(() => null);
}

export function emitMusicMiniTeardown(): void {
  const payload: ActivityMiniTeardownPayload = { surface: "music-mini" };
  void emitTo("main", "activity-mini-teardown", payload).catch(() => null);
}

export async function closeVideoMiniFromMini(): Promise<void> {
  emitVideoMiniTeardown();
  try {
    await getCurrentWindow().close();
  } catch (e) {
    console.error("Failed to close video mini", e);
  }
}

export async function closeMusicMiniFromMini(): Promise<void> {
  emitMusicMiniTeardown();
  try {
    await getCurrentWindow().close();
  } catch (e) {
    console.error("Failed to close music mini", e);
  }
}

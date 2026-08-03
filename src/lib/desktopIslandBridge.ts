import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { setAudioOutputDeviceId } from "@/audioOutputDevices";
import type { DynamicIslandContent } from "@/components/island/DynamicIsland";
import type { IslandSkipDir } from "@/components/island/islandSkipMotion";
import type { ActivityRenderState } from "@/lib/activityTypes";
import { navigateToActivityOwningSurface } from "@/lib/activityIslandResolve";
import { noteIslandSkipDir } from "@/lib/islandSkipDirection";
import { getMainPlaybackBridge } from "@/lib/mainPlaybackBridge";
import { isAudioOnlyPath } from "@/mediaKind";
import { readPlaybackSpeed } from "@/playbackSpeedStorage";
import { useRuforgeStore } from "@/store/ruforgeStore";

export const DESKTOP_ISLAND_LABEL = "island";
export const DESKTOP_ISLAND_STATE_EVENT = "desktop-island-state";
export const DESKTOP_ISLAND_CONTROL_EVENT = "desktop-island-control";
export const MAIN_HIDDEN_EVENT = "ruforge:main-hidden";

export type DesktopIslandStatePayload = {
  content: DynamicIslandContent;
  waveformLevels: readonly number[];
  renderState: ActivityRenderState;
  filePath: string | null;
  /** Present on track changes so the overlay webview can slide prev vs next. */
  skipDir?: IslandSkipDir;
};

export type DesktopIslandControl =
  | { type: "togglePlay" }
  | { type: "seek"; seconds: number }
  | { type: "beginScrub" }
  | { type: "releaseScrub"; seconds: number }
  | { type: "skipPrev" }
  | { type: "skipNext" }
  | { type: "skipBy"; delta: number }
  | { type: "volume"; volume: number }
  | { type: "muted"; muted: boolean }
  | { type: "loop" }
  | { type: "audioOutput"; deviceId: string }
  | { type: "openPlayer" }
  | { type: "popOut" };

export async function pushDesktopIslandState(payload: DesktopIslandStatePayload): Promise<void> {
  await emitTo(DESKTOP_ISLAND_LABEL, DESKTOP_ISLAND_STATE_EVENT, payload);
}

export async function emitDesktopIslandControl(control: DesktopIslandControl): Promise<void> {
  await emitTo("main", DESKTOP_ISLAND_CONTROL_EVENT, control);
}

export async function restoreMainFromDesktopIsland(): Promise<void> {
  const main = await WebviewWindow.getByLabel("main");
  if (!main) return;
  try {
    await main.unminimize();
  } catch {
    /* ignore */
  }
  try {
    await main.show();
  } catch {
    /* ignore */
  }
  try {
    await main.setFocus();
  } catch {
    /* ignore */
  }
}

export function applyDesktopIslandControl(control: DesktopIslandControl): void {
  const bridge = getMainPlaybackBridge();
  const st = useRuforgeStore.getState();

  switch (control.type) {
    case "togglePlay":
      bridge?.togglePlay?.();
      return;
    case "seek":
      bridge?.seek?.(control.seconds);
      return;
    case "beginScrub":
      bridge?.beginScrub?.();
      return;
    case "releaseScrub":
      if (bridge?.releaseScrub) {
        bridge.releaseScrub(control.seconds);
        return;
      }
      bridge?.seek?.(control.seconds);
      return;
    case "skipPrev":
      noteIslandSkipDir(-1);
      bridge?.skipPrev?.();
      return;
    case "skipNext":
      noteIslandSkipDir(1);
      bridge?.skipNext?.();
      return;
    case "skipBy": {
      if (!bridge?.seek) return;
      const duration = bridge.duration > 0 ? bridge.duration : 0;
      const next = Math.min(
        duration > 0 ? duration : Number.POSITIVE_INFINITY,
        Math.max(0, bridge.currentTime + control.delta),
      );
      bridge.seek(next);
      return;
    }
    case "volume":
      st.setVolume(control.volume);
      return;
    case "muted":
      st.setMuted(control.muted);
      return;
    case "loop":
      st.cycleLoopMode();
      return;
    case "audioOutput":
      setAudioOutputDeviceId(control.deviceId);
      return;
    case "openPlayer": {
      const file = st.playingFile;
      const renderState: ActivityRenderState =
        st.activityOwner === "video-mini" || st.activityOwner === "music-mini"
          ? "mini-owned"
          : !file
            ? "idle"
            : isAudioOnlyPath(file.path)
              ? "main-music"
              : "main-video";
      navigateToActivityOwningSurface(renderState, file?.path, {
        setNavMode: st.setNavMode,
        setActiveTab: st.setActiveTab,
      });
      return;
    }
    case "popOut": {
      const file = st.playingFile;
      if (!file) return;
      const t = bridge?.currentTime ?? 0;
      void st.handlePopOut(t, {
        paused: bridge?.paused ?? true,
        playbackSpeed: readPlaybackSpeed(),
      });
      return;
    }
    default:
      return;
  }
}

export function listenDesktopIslandControl(
  onControl: (control: DesktopIslandControl) => void,
): Promise<UnlistenFn> {
  return listen<DesktopIslandControl>(DESKTOP_ISLAND_CONTROL_EVENT, (event) => {
    if (!event.payload || typeof event.payload !== "object") return;
    onControl(event.payload);
  });
}

export function listenDesktopIslandState(
  onState: (payload: DesktopIslandStatePayload) => void,
): Promise<UnlistenFn> {
  return listen<DesktopIslandStatePayload>(DESKTOP_ISLAND_STATE_EVENT, (event) => {
    if (!event.payload || typeof event.payload !== "object") return;
    onState(event.payload);
  });
}

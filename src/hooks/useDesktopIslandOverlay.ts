import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  getAudioOutputDeviceId,
  getCachedAudioOutputDevices,
  listAudioOutputDevices,
  subscribeAudioOutputDeviceId,
  subscribeCachedAudioOutputDevices,
} from "@/audioOutputDevices";
import type { LoopMode } from "@/playbackLoopStorage";
import { primaryArtist, rawArtistFromFile } from "@/components/music/musicArtist";
import { useCurrentActivity } from "@/hooks/useCurrentActivity";
import type { IslandSkipDir } from "@/components/island/islandSkipMotion";
import {
  applyDesktopIslandControl,
  listenDesktopIslandControl,
  MAIN_HIDDEN_EVENT,
  pushDesktopIslandState,
  type DesktopIslandStatePayload,
} from "@/lib/desktopIslandBridge";
import { takeIslandSkipDirForBridge } from "@/lib/islandSkipDirection";
import {
  getIslandWaveformLevels,
  setIslandWaveformBackgroundPump,
  subscribeIslandWaveformLevels,
} from "@/lib/islandWaveformLevels";
import {
  getMainPlaybackBridge,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import { useRuforgeStore } from "@/store/ruforgeStore";

const TELEMETRY_MIN_MS = 100;

async function isMainAway(): Promise<boolean> {
  const win = getCurrentWindow();
  let minimized = false;
  let visible = true;
  try {
    minimized = await win.isMinimized();
  } catch {
    /* ignore */
  }
  try {
    visible = await win.isVisible();
  } catch {
    /* ignore */
  }
  return minimized || !visible;
}

function buildDesktopIslandPayload(
  activity: ReturnType<typeof useCurrentActivity>,
  settingsAccent: string,
  volume: number,
  isMuted: boolean,
  loopMode: LoopMode,
  audioOutputDeviceId: string,
  audioOutputDevices: ReturnType<typeof getCachedAudioOutputDevices>,
): DesktopIslandStatePayload | null {
  if (
    !activity.hasSession ||
    activity.isStub ||
    (activity.renderState !== "main-music" && activity.renderState !== "main-video")
  ) {
    return null;
  }

  const playback = getMainPlaybackBridge();
  const livePaused = playback?.paused ?? activity.paused;
  const liveCurrentTime = playback?.currentTime ?? activity.currentTime;
  const liveDuration = activity.duration > 0 ? activity.duration : (playback?.duration ?? 0);
  const title = activity.file?.name ?? "Unknown";
  const subtitle =
    activity.file && activity.renderState === "main-music"
      ? primaryArtist(rawArtistFromFile(activity.file)) || null
      : null;
  const progress =
    liveDuration > 0 ? Math.min(100, (liveCurrentTime / liveDuration) * 100) : 0;
  const waveformPaused = livePaused;
  const trackKey = activity.file?.path ?? "";

  return {
    renderState: activity.renderState,
    filePath: activity.file?.path ?? null,
    waveformLevels: getIslandWaveformLevels(),
    content: {
      coverSrc: activity.coverSrc,
      trackKey,
      title,
      subtitle,
      stubLabel: null,
      paused: livePaused,
      waveformPaused,
      accentColor: settingsAccent,
      currentTime: liveCurrentTime,
      duration: liveDuration,
      progress,
      showTrackSkip: activity.renderState === "main-music",
      showExpandedControls: true,
      hasPrev: Boolean(playback?.hasPrevInQueue),
      hasNext: Boolean(playback?.hasNextInQueue),
      isStub: false,
      canSeek: Boolean(playback?.seek) && liveDuration > 0,
      isMuted,
      volume,
      loopMode,
      audioOutputDeviceId,
      audioOutputDevices,
    },
  };
}

function attachSkipDirForTrackChange(
  payload: DesktopIslandStatePayload,
  lastPushedTrackKeyRef: { current: string | null },
): DesktopIslandStatePayload {
  const trackKey = payload.content.trackKey;
  const trackChanged = Boolean(trackKey) && trackKey !== lastPushedTrackKeyRef.current;
  if (!trackChanged) {
    return { ...payload, skipDir: undefined };
  }
  const skipDir: IslandSkipDir = takeIslandSkipDirForBridge();
  lastPushedTrackKeyRef.current = trackKey;
  return { ...payload, skipDir };
}

/**
 * Shows the top-of-screen island overlay while main is minimized or tray-hidden
 * and main-owned playback is active. Suppresses when mini owns playback.
 */
export function useDesktopIslandOverlay(enabled: boolean) {
  const activity = useCurrentActivity();
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const loopMode = useRuforgeStore((s) => s.loopMode);
  const audioOutputDeviceId = useSyncExternalStore(
    subscribeAudioOutputDeviceId,
    getAudioOutputDeviceId,
    getAudioOutputDeviceId,
  );
  const audioOutputDevices = useSyncExternalStore(
    subscribeCachedAudioOutputDevices,
    getCachedAudioOutputDevices,
    getCachedAudioOutputDevices,
  );
  const settingsAccent = useRuforgeStore((s) =>
    typeof s.settings.accentColor === "string" ? s.settings.accentColor : "#EDCF9B",
  );

  const awayRef = useRef(false);
  const shownRef = useRef(false);
  const lastPushAtRef = useRef(0);
  const lastPushedTrackKeyRef = useRef<string | null>(null);
  const pendingPushRef = useRef<DesktopIslandStatePayload | null>(null);
  const activityRef = useRef(activity);
  activityRef.current = activity;

  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);
  const loopModeRef = useRef(loopMode);
  const audioOutputRef = useRef(audioOutputDeviceId);
  const audioOutputDevicesRef = useRef(audioOutputDevices);
  const accentRef = useRef(settingsAccent);
  volumeRef.current = volume;
  mutedRef.current = isMuted;
  loopModeRef.current = loopMode;
  audioOutputRef.current = audioOutputDeviceId;
  audioOutputDevicesRef.current = audioOutputDevices;
  accentRef.current = settingsAccent;

  useEffect(() => {
    if (!enabled) return;
    const unlisten = listenDesktopIslandControl((control) => {
      applyDesktopIslandControl(control);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      if (shownRef.current) {
        shownRef.current = false;
        setIslandWaveformBackgroundPump(false);
        void invoke("hide_island_overlay").catch(() => {});
      }
      return;
    }

    let cancelled = false;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;

    const pushNow = (payload: DesktopIslandStatePayload) => {
      lastPushAtRef.current = Date.now();
      pendingPushRef.current = null;
      void pushDesktopIslandState(payload).catch(() => {});
    };

    const queuePush = (payload: DesktopIslandStatePayload) => {
      // Keep the newest payload; preserve skipDir from an earlier track-change
      // packet if this telemetry tick is same-track.
      const prev = pendingPushRef.current;
      if (
        prev?.skipDir != null &&
        prev.content.trackKey === payload.content.trackKey &&
        payload.skipDir == null
      ) {
        pendingPushRef.current = { ...payload, skipDir: prev.skipDir };
      } else {
        pendingPushRef.current = payload;
      }

      const now = Date.now();
      if (now - lastPushAtRef.current >= TELEMETRY_MIN_MS) {
        const next = pendingPushRef.current;
        if (next) pushNow(next);
        return;
      }
      if (pushTimer != null) return;
      pushTimer = setTimeout(() => {
        pushTimer = null;
        if (cancelled) return;
        const next = pendingPushRef.current;
        if (next) pushNow(next);
      }, TELEMETRY_MIN_MS - (now - lastPushAtRef.current));
    };

    const syncOverlay = async (forceAway?: boolean) => {
      if (cancelled) return;
      if (typeof forceAway === "boolean") {
        awayRef.current = forceAway;
      }
      const mainAway = awayRef.current;
      const raw = buildDesktopIslandPayload(
        activityRef.current,
        accentRef.current,
        volumeRef.current,
        mutedRef.current,
        loopModeRef.current,
        audioOutputRef.current,
        audioOutputDevicesRef.current,
      );
      const want = mainAway && raw != null;

      if (want && raw) {
        const payload = attachSkipDirForTrackChange(raw, lastPushedTrackKeyRef);
        if (!shownRef.current) {
          shownRef.current = true;
          setIslandWaveformBackgroundPump(true);
          await invoke("show_island_overlay").catch(() => {});
        }
        queuePush(payload);
      } else if (shownRef.current) {
        shownRef.current = false;
        pendingPushRef.current = null;
        setIslandWaveformBackgroundPump(false);
        await invoke("hide_island_overlay").catch(() => {});
      }
    };

    const refreshAway = async () => {
      const away = await isMainAway();
      await syncOverlay(away);
    };

    void refreshAway();

    const win = getCurrentWindow();
    const unlistenResize = win.onResized(() => {
      void refreshAway();
    });
    const unlistenFocus = win.onFocusChanged(() => {
      void refreshAway();
    });

    const unlistenHidden = listen(MAIN_HIDDEN_EVENT, () => {
      void syncOverlay(true);
      window.setTimeout(() => {
        void refreshAway();
      }, 50);
    });
    const unlistenTrayShow = listen("ruforge:tray-show-main", () => {
      void syncOverlay(false);
      window.setTimeout(() => {
        void refreshAway();
      }, 50);
    });

    const unsubBridge = subscribeMainPlaybackBridge(() => {
      void syncOverlay();
    });
    const unsubWave = subscribeIslandWaveformLevels(() => {
      if (!shownRef.current) return;
      void syncOverlay();
    });

    const onVis = () => {
      void refreshAway();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (pushTimer != null) clearTimeout(pushTimer);
      document.removeEventListener("visibilitychange", onVis);
      unsubBridge();
      unsubWave();
      void unlistenResize.then((fn) => fn());
      void unlistenFocus.then((fn) => fn());
      void unlistenHidden.then((fn) => fn());
      void unlistenTrayShow.then((fn) => fn());
      if (shownRef.current) {
        shownRef.current = false;
        setIslandWaveformBackgroundPump(false);
        void invoke("hide_island_overlay").catch(() => {});
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!awayRef.current) return;

    const raw = buildDesktopIslandPayload(
      activity,
      settingsAccent,
      volume,
      isMuted,
      loopMode,
      audioOutputDeviceId,
      audioOutputDevices,
    );
    if (raw == null) {
      if (shownRef.current) {
        shownRef.current = false;
        setIslandWaveformBackgroundPump(false);
        void invoke("hide_island_overlay").catch(() => {});
      }
      return;
    }

    const payload = attachSkipDirForTrackChange(raw, lastPushedTrackKeyRef);

    if (!shownRef.current) {
      shownRef.current = true;
      setIslandWaveformBackgroundPump(true);
      void listAudioOutputDevices({ unlock: true });
      void invoke("show_island_overlay")
        .then(() => pushDesktopIslandState(payload))
        .catch(() => {});
      return;
    }
    void pushDesktopIslandState(payload).catch(() => {});
  }, [
    enabled,
    activity,
    settingsAccent,
    volume,
    isMuted,
    loopMode,
    audioOutputDeviceId,
    audioOutputDevices,
  ]);
}

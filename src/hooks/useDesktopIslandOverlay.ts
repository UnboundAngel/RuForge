import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

import { primaryArtist, rawArtistFromFile } from "@/components/music/musicArtist";
import { useCurrentActivity } from "@/hooks/useCurrentActivity";
import {
  applyDesktopIslandControl,
  listenDesktopIslandControl,
  MAIN_HIDDEN_EVENT,
  pushDesktopIslandState,
  type DesktopIslandStatePayload,
} from "@/lib/desktopIslandBridge";
import {
  getIslandWaveformLevels,
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
  isLooping: boolean,
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

  return {
    renderState: activity.renderState,
    filePath: activity.file?.path ?? null,
    waveformLevels: getIslandWaveformLevels(),
    content: {
      coverSrc: activity.coverSrc,
      trackKey: activity.file?.path ?? "",
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
      isLooping,
    },
  };
}

/**
 * Shows the top-of-screen island overlay while main is minimized or tray-hidden
 * and main-owned playback is active. Suppresses when mini owns playback.
 */
export function useDesktopIslandOverlay(enabled: boolean) {
  const activity = useCurrentActivity();
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const isLooping = useRuforgeStore((s) => s.isLooping);
  const settingsAccent = useRuforgeStore((s) =>
    typeof s.settings.accentColor === "string" ? s.settings.accentColor : "#EDCF9B",
  );

  const awayRef = useRef(false);
  const shownRef = useRef(false);
  const lastPushAtRef = useRef(0);
  const activityRef = useRef(activity);
  activityRef.current = activity;

  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);
  const loopingRef = useRef(isLooping);
  const accentRef = useRef(settingsAccent);
  volumeRef.current = volume;
  mutedRef.current = isMuted;
  loopingRef.current = isLooping;
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
        void invoke("hide_island_overlay").catch(() => {});
      }
      return;
    }

    let cancelled = false;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;

    const syncOverlay = async (forceAway?: boolean) => {
      if (cancelled) return;
      if (typeof forceAway === "boolean") {
        awayRef.current = forceAway;
      }
      const mainAway = awayRef.current;
      const payload = buildDesktopIslandPayload(
        activityRef.current,
        accentRef.current,
        volumeRef.current,
        mutedRef.current,
        loopingRef.current,
      );
      const want = mainAway && payload != null;

      if (want) {
        if (!shownRef.current) {
          shownRef.current = true;
          await invoke("show_island_overlay").catch(() => {});
        }
        const now = Date.now();
        const flush = () => {
          if (cancelled) return;
          lastPushAtRef.current = Date.now();
          const next = buildDesktopIslandPayload(
            activityRef.current,
            accentRef.current,
            volumeRef.current,
            mutedRef.current,
            loopingRef.current,
          );
          if (!next) return;
          void pushDesktopIslandState(next).catch(() => {});
        };
        if (now - lastPushAtRef.current >= TELEMETRY_MIN_MS) {
          flush();
        } else if (pushTimer == null) {
          pushTimer = setTimeout(() => {
            pushTimer = null;
            flush();
          }, TELEMETRY_MIN_MS - (now - lastPushAtRef.current));
        }
      } else if (shownRef.current) {
        shownRef.current = false;
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
        void invoke("hide_island_overlay").catch(() => {});
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!awayRef.current) return;

    const payload = buildDesktopIslandPayload(
      activity,
      settingsAccent,
      volume,
      isMuted,
      isLooping,
    );
    if (payload == null) {
      if (shownRef.current) {
        shownRef.current = false;
        void invoke("hide_island_overlay").catch(() => {});
      }
      return;
    }

    if (!shownRef.current) {
      shownRef.current = true;
      void invoke("show_island_overlay")
        .then(() => pushDesktopIslandState(payload))
        .catch(() => {});
      return;
    }
    void pushDesktopIslandState(payload).catch(() => {});
  }, [enabled, activity, settingsAccent, volume, isMuted, isLooping]);
}

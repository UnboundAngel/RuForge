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
import type { DynamicIslandContent } from "@/components/island/DynamicIsland";
import type { IslandNotice } from "@/components/island/IslandNoticeContent";
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
import { buildIslandDownload } from "@/lib/islandDownload";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { DESKTOP_ISLAND_NOTICE_EVENT, type DesktopIslandNoticePayload } from "@/systemNotify";
import { islandAvatarSrc, subscribeIslandAvatars } from "@/watchlist/islandAvatars";
import { buildIslandWatchlist, ISLAND_WATCHLIST_TAKEOVER_MS } from "@/watchlist/islandWatchlist";
import { clearIslandBatch, useWatchlistStore } from "@/watchlist/watchlistStore";

const TELEMETRY_MIN_MS = 100;
const NOTICE_MS = 4500;
const FOREGROUND_POLL_MS = 1000;

type MainWindowState = { away: boolean; focused: boolean };

async function readMainWindowState(): Promise<MainWindowState> {
  const win = getCurrentWindow();
  let minimized = false;
  let visible = true;
  let focused = true;
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
  try {
    focused = await invoke<boolean>("app_is_foreground");
  } catch {
    try {
      focused = await win.isFocused();
    } catch {
      /* ignore */
    }
  }
  const away = minimized || !visible;
  return { away, focused: focused && !away };
}

type MusicSnapshot = Pick<DesktopIslandStatePayload, "content" | "renderState" | "filePath">;

function buildMusicSnapshot(
  activity: ReturnType<typeof useCurrentActivity>,
  settingsAccent: string,
  volume: number,
  isMuted: boolean,
  loopMode: LoopMode,
  audioOutputDeviceId: string,
  audioOutputDevices: ReturnType<typeof getCachedAudioOutputDevices>,
): MusicSnapshot | null {
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

  return {
    renderState: activity.renderState,
    filePath: activity.file?.path ?? null,
    content: {
      coverSrc: activity.coverSrc,
      trackKey: activity.file?.path ?? "",
      title,
      subtitle,
      stubLabel: null,
      paused: livePaused,
      waveformPaused: livePaused,
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

function emptyContent(accentColor: string): DynamicIslandContent {
  return {
    coverSrc: null,
    trackKey: "",
    title: "",
    subtitle: null,
    stubLabel: null,
    paused: true,
    waveformPaused: true,
    accentColor,
    currentTime: 0,
    duration: 0,
    progress: 0,
    showTrackSkip: false,
    showExpandedControls: false,
    hasPrev: false,
    hasNext: false,
    isStub: false,
    canSeek: false,
    isMuted: false,
    volume: 1,
    loopMode: "off",
    audioOutputDeviceId: "",
    audioOutputDevices: [],
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
 * Drives the top-of-screen desktop island. Music shows while main is minimized or
 * tray-hidden (mini ownership suppresses it). Downloads and background notices show
 * whenever main is not focused, and ride along as a ring when music is up.
 */
export function useDesktopIslandOverlay(enabled: boolean) {
  const activity = useCurrentActivity();
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const loopMode = useRuforgeStore((s) => s.loopMode);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
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

  const windowRef = useRef<MainWindowState>({ away: false, focused: true });
  const noticeRef = useRef<IslandNotice | null>(null);
  const syncRef = useRef<() => void>(() => {});

  const inputsRef = useRef({
    activity,
    volume,
    isMuted,
    loopMode,
    downloadJobs,
    audioOutputDeviceId,
    audioOutputDevices,
    settingsAccent,
  });
  inputsRef.current = {
    activity,
    volume,
    isMuted,
    loopMode,
    downloadJobs,
    audioOutputDeviceId,
    audioOutputDevices,
    settingsAccent,
  };

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
    if (!enabled) return;

    let cancelled = false;
    let shown = false;
    let musicShown = false;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
    let takeoverTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPushAt = 0;
    let pending: DesktopIslandStatePayload | null = null;
    const lastPushedTrackKeyRef = { current: null as string | null };

    const pushNow = (payload: DesktopIslandStatePayload) => {
      lastPushAt = Date.now();
      pending = null;
      void pushDesktopIslandState(payload).catch(() => {});
    };

    const queuePush = (payload: DesktopIslandStatePayload) => {
      // Keep the newest payload; preserve skipDir from an earlier track-change packet.
      if (
        pending?.skipDir != null &&
        pending.content.trackKey === payload.content.trackKey &&
        payload.skipDir == null
      ) {
        pending = { ...payload, skipDir: pending.skipDir };
      } else {
        pending = payload;
      }
      const now = Date.now();
      if (now - lastPushAt >= TELEMETRY_MIN_MS) {
        pushNow(pending);
        return;
      }
      if (pushTimer != null) return;
      pushTimer = setTimeout(() => {
        pushTimer = null;
        if (!cancelled && pending) pushNow(pending);
      }, TELEMETRY_MIN_MS - (now - lastPushAt));
    };

    const hide = () => {
      if (!shown) return;
      shown = false;
      musicShown = false;
      pending = null;
      setIslandWaveformBackgroundPump(false);
      // The overlay keeps its last frame while hidden; blank it so the next show doesn't replay a stale notice.
      void pushDesktopIslandState({
        content: emptyContent(inputsRef.current.settingsAccent),
        renderState: "idle",
        filePath: null,
        waveformLevels: [],
        download: null,
        notice: null,
        watchlist: null,
      }).catch(() => {});
      void invoke("hide_island_overlay").catch(() => {});
    };

    const sync = () => {
      if (cancelled) return;
      const i = inputsRef.current;
      const { away, focused } = windowRef.current;
      const music = away
        ? buildMusicSnapshot(
            i.activity,
            i.settingsAccent,
            i.volume,
            i.isMuted,
            i.loopMode,
            i.audioOutputDeviceId,
            i.audioOutputDevices,
          )
        : null;
      const download = focused ? null : buildIslandDownload(i.downloadJobs);
      const notice = focused ? null : noticeRef.current;
      const batch = useWatchlistStore.getState();
      const watchlist = focused ? null : buildIslandWatchlist(batch, islandAvatarSrc, Date.now());
      if (watchlist?.takeover && takeoverTimer == null) {
        // Nothing else re-syncs when the takeover window lapses, so music would never get the pill back.
        takeoverTimer = setTimeout(() => {
          takeoverTimer = null;
          sync();
        }, ISLAND_WATCHLIST_TAKEOVER_MS - (Date.now() - batch.islandBatchAt) + 50);
      }

      if (!music && !download && !notice && !watchlist) {
        hide();
        return;
      }

      const payload = attachSkipDirForTrackChange(
        {
          content: music?.content ?? emptyContent(i.settingsAccent),
          renderState: music?.renderState ?? "idle",
          filePath: music?.filePath ?? null,
          waveformLevels: music ? getIslandWaveformLevels() : [],
          download,
          notice,
          watchlist,
        },
        lastPushedTrackKeyRef,
      );

      if (Boolean(music) !== musicShown) {
        musicShown = Boolean(music);
        setIslandWaveformBackgroundPump(musicShown);
        if (musicShown) void listAudioOutputDevices({ unlock: true });
      }
      if (!shown) {
        shown = true;
        void invoke("show_island_overlay")
          .then(() => pushNow(payload))
          .catch(() => {});
        return;
      }
      queuePush(payload);
    };
    syncRef.current = sync;

    const refreshWindow = async () => {
      windowRef.current = await readMainWindowState();
      // Back in the app the bell and shelf carry these; a stale batch would replay on the next minimize.
      if (windowRef.current.focused) clearIslandBatch();
      sync();
    };

    void refreshWindow();

    const win = getCurrentWindow();
    const unlistenResize = win.onResized(() => void refreshWindow());
    const unlistenFocus = win.onFocusChanged(() => void refreshWindow());
    const unlistenHidden = listen(MAIN_HIDDEN_EVENT, () => {
      windowRef.current = { away: true, focused: false };
      sync();
      window.setTimeout(() => void refreshWindow(), 50);
    });
    const unlistenTrayShow = listen("ruforge:tray-show-main", () => {
      windowRef.current = { away: false, focused: true };
      sync();
      window.setTimeout(() => void refreshWindow(), 50);
    });
    const unlistenNotice = listen<DesktopIslandNoticePayload>(DESKTOP_ISLAND_NOTICE_EVENT, (e) => {
      const p = e.payload;
      if (!p?.message) return;
      noticeRef.current = { id: Date.now(), message: p.message, type: p.kind };
      if (noticeTimer != null) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        noticeTimer = null;
        noticeRef.current = null;
        sync();
      }, NOTICE_MS);
      void refreshWindow();
    });

    const unsubBridge = subscribeMainPlaybackBridge(sync);
    const unsubWatchlist = useWatchlistStore.subscribe(sync);
    const unsubAvatars = subscribeIslandAvatars(sync);
    const unsubWave = subscribeIslandWaveformLevels(() => {
      if (musicShown) sync();
    });
    const onVis = () => void refreshWindow();
    document.addEventListener("visibilitychange", onVis);
    // Focus moving from the Explorer webview or an overlay window to another app fires nothing on main.
    // Also polls while a session is live, so a pill dropped by a transient gap comes back on its own.
    const foregroundPoll = window.setInterval(() => {
      const i = inputsRef.current;
      if (shown || i.activity.hasSession || buildIslandDownload(i.downloadJobs)) void refreshWindow();
    }, FOREGROUND_POLL_MS);

    return () => {
      cancelled = true;
      syncRef.current = () => {};
      if (pushTimer != null) clearTimeout(pushTimer);
      if (noticeTimer != null) clearTimeout(noticeTimer);
      if (takeoverTimer != null) clearTimeout(takeoverTimer);
      noticeRef.current = null;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(foregroundPoll);
      unsubBridge();
      unsubWatchlist();
      unsubAvatars();
      unsubWave();
      void unlistenResize.then((fn) => fn());
      void unlistenFocus.then((fn) => fn());
      void unlistenHidden.then((fn) => fn());
      void unlistenTrayShow.then((fn) => fn());
      void unlistenNotice.then((fn) => fn());
      hide();
    };
  }, [enabled]);

  useEffect(() => {
    syncRef.current();
  }, [
    activity,
    settingsAccent,
    volume,
    isMuted,
    loopMode,
    downloadJobs,
    audioOutputDeviceId,
    audioOutputDevices,
  ]);
}

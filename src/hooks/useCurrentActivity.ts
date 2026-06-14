import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  bridgeOwnerMatchesRenderState,
  resolveActivityAwayFromSurface,
  resolveActivityHasSession,
} from "@/lib/activityIslandResolve";
import {
  getMainPlaybackBridge,
  getMainPlaybackBridgeOwner,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import type { ActivityRenderState, CurrentActivity } from "@/lib/activityTypes";
import { bestCoverPath, isAudioOnlyPath } from "@/mediaKind";
import { readFurthestPlaybackSec, readStoredPlaybackDuration } from "@/playbackStorage";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";

type LiveBridgeCache = {
  paused: boolean;
  currentTime: number;
  duration: number;
};

function coverPathForFile(file: MediaFile | null): string | null {
  if (!file) return null;
  if (isAudioOnlyPath(file.path)) {
    return bestCoverPath(file);
  }
  return file.thumbnailPath ?? file.ruforgePosterPath ?? null;
}

function coverSrcForPath(coverPath: string | null): string | null {
  return coverPath ? convertFileSrc(coverPath) : null;
}

function resolveDuration(file: MediaFile | null, bridgeDuration: number): number {
  if (bridgeDuration > 0 && Number.isFinite(bridgeDuration)) return bridgeDuration;
  if (file && file.duration > 0) return file.duration;
  if (file) {
    const stored = readStoredPlaybackDuration(file.path);
    if (stored > 0) return stored;
  }
  return 0;
}

function resolveRenderState(
  activityOwner: ReturnType<typeof useRuforgeStore.getState>["activityOwner"],
  playingFile: MediaFile | null,
): ActivityRenderState {
  if (activityOwner === "video-mini" || activityOwner === "music-mini") {
    return "mini-owned";
  }
  if (!playingFile) return "idle";
  if (isAudioOnlyPath(playingFile.path)) return "main-music";
  return "main-video";
}

export function useCurrentActivity(): CurrentActivity {
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const navMode = useRuforgeStore((s) => s.navMode);
  const activityOwner = useRuforgeStore((s) => s.activityOwner);
  const activityHandoff = useRuforgeStore((s) => s.activityHandoff);
  const playback = useSyncExternalStore(
    subscribeMainPlaybackBridge,
    getMainPlaybackBridge,
    getMainPlaybackBridge,
  );
  const bridgeOwner = useSyncExternalStore(
    subscribeMainPlaybackBridge,
    getMainPlaybackBridgeOwner,
    getMainPlaybackBridgeOwner,
  );

  const lastLiveBridgeRef = useRef<LiveBridgeCache | null>(null);

  const renderState = resolveRenderState(activityOwner, playingFile);
  const hasSession = resolveActivityHasSession(renderState);
  const awayFromOwningSurface = resolveActivityAwayFromSurface(
    renderState,
    activeTab,
    navMode,
  );

  const file = useMemo(() => {
    if (renderState === "mini-owned") return activityHandoff?.file ?? null;
    return playingFile;
  }, [renderState, activityHandoff, playingFile]);

  const coverPath = useMemo(() => coverPathForFile(file), [file]);
  const coverSrc = useMemo(() => coverSrcForPath(coverPath), [coverPath]);

  useEffect(() => {
    if (renderState === "idle" || playback === null) {
      lastLiveBridgeRef.current = null;
    }
  }, [renderState, playback]);

  const hasLivePlayback =
    playback !== null && bridgeOwnerMatchesRenderState(bridgeOwner, renderState);

  const paused = useMemo(() => {
    if (renderState === "mini-owned") return activityHandoff?.paused ?? true;
    if (playback) return playback.paused;
    if (lastLiveBridgeRef.current) return lastLiveBridgeRef.current.paused;
    return true;
  }, [renderState, activityHandoff, playback]);

  const { currentTime, duration } = useMemo(() => {
    if (renderState === "mini-owned") {
      const f = activityHandoff?.file;
      const t = activityHandoff?.startTime ?? 0;
      const dur =
        f && f.duration > 0
          ? f.duration
          : f
            ? readStoredPlaybackDuration(f.path)
            : 0;
      return { currentTime: t, duration: dur };
    }

    if (playback) {
      const dur = resolveDuration(file, playback.duration);
      const next = {
        currentTime: Math.max(0, playback.currentTime),
        duration: dur,
        paused: playback.paused,
      };
      lastLiveBridgeRef.current = next;
      return { currentTime: next.currentTime, duration: next.duration };
    }

    if (lastLiveBridgeRef.current) {
      return {
        currentTime: lastLiveBridgeRef.current.currentTime,
        duration: lastLiveBridgeRef.current.duration,
      };
    }

    if (playingFile && renderState === "main-video") {
      const dur = resolveDuration(playingFile, 0);
      return {
        currentTime: readFurthestPlaybackSec(playingFile.path),
        duration: dur,
      };
    }

    return { currentTime: 0, duration: 0 };
  }, [renderState, activityHandoff, playback, playingFile, file]);

  return useMemo(
    (): CurrentActivity => ({
      renderState,
      hasSession,
      awayFromOwningSurface,
      file,
      paused,
      currentTime,
      duration,
      coverSrc,
      isStub: renderState === "mini-owned",
      stubLabel: renderState === "mini-owned" ? "playing in mini" : null,
      hasLivePlayback,
    }),
    [
      renderState,
      hasSession,
      awayFromOwningSurface,
      file,
      paused,
      currentTime,
      duration,
      coverSrc,
      hasLivePlayback,
    ],
  );
}

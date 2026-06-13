import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  getMainPlaybackBridge,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import type { ActivityRenderState, CurrentActivity } from "@/lib/activityTypes";
import { resolveActivityShowIsland } from "@/lib/activityIslandResolve";
import { bestCoverPath, isAudioOnlyPath } from "@/mediaKind";
import { extractProminentColor } from "@/prominentColor";
import { readFurthestPlaybackSec, readStoredPlaybackDuration } from "@/playbackStorage";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";

const DEFAULT_ACCENT = "#EDCF9B";

function coverPathForFile(file: MediaFile): string | null {
  if (isAudioOnlyPath(file.path)) {
    return bestCoverPath(file);
  }
  return file.thumbnailPath ?? file.ruforgePosterPath ?? null;
}

function coverSrcForFile(file: MediaFile | null): string | null {
  if (!file) return null;
  const p = coverPathForFile(file);
  return p ? convertFileSrc(p) : null;
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

export function useCurrentActivity(): CurrentActivity & { accentColor: string } {
  const playingFile = useRuforgeStore((s) => s.playingFile);
  const activeTab = useRuforgeStore((s) => s.activeTab);
  const navMode = useRuforgeStore((s) => s.navMode);
  const activityOwner = useRuforgeStore((s) => s.activityOwner);
  const activityHandoff = useRuforgeStore((s) => s.activityHandoff);
  const settingsAccent = useRuforgeStore((s) =>
    typeof s.settings.accentColor === "string" ? s.settings.accentColor : DEFAULT_ACCENT,
  );

  const playback = useSyncExternalStore(
    subscribeMainPlaybackBridge,
    getMainPlaybackBridge,
    getMainPlaybackBridge,
  );

  const renderState = resolveRenderState(activityOwner, playingFile);
  const showIsland = resolveActivityShowIsland(renderState, activeTab, navMode);

  const file = useMemo(() => {
    if (renderState === "mini-owned") return activityHandoff?.file ?? null;
    return playingFile;
  }, [renderState, activityHandoff, playingFile]);

  const coverSrc = useMemo(() => coverSrcForFile(file), [file]);

  const [accentColor, setAccentColor] = useState(settingsAccent);

  useEffect(() => {
    if (!coverSrc) {
      setAccentColor(settingsAccent);
      return;
    }
    let cancelled = false;
    void extractProminentColor(coverSrc).then((color) => {
      if (cancelled) return;
      setAccentColor(color || settingsAccent);
    });
    return () => {
      cancelled = true;
    };
  }, [coverSrc, settingsAccent]);

  const hasLivePlayback = playback !== null;

  const paused = useMemo(() => {
    if (renderState === "mini-owned") return activityHandoff?.paused ?? true;
    if (playback) return playback.paused;
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
      return {
        currentTime: playback.currentTime,
        duration: playback.duration,
      };
    }
    if (playingFile && renderState === "main-video") {
      const dur = Math.max(
        playingFile.duration > 0 ? playingFile.duration : 0,
        readStoredPlaybackDuration(playingFile.path),
      );
      return {
        currentTime: readFurthestPlaybackSec(playingFile.path),
        duration: dur,
      };
    }
    return { currentTime: 0, duration: 0 };
  }, [renderState, activityHandoff, playback, playingFile]);

  const activity = useMemo(
    (): CurrentActivity => ({
      renderState,
      showIsland,
      file,
      paused,
      currentTime,
      duration,
      coverSrc,
      isStub: renderState === "mini-owned",
      stubLabel: renderState === "mini-owned" ? "playing in mini" : null,
      hasLivePlayback,
    }),
    [renderState, showIsland, file, paused, currentTime, duration, coverSrc, hasLivePlayback],
  );

  return { ...activity, accentColor };
}

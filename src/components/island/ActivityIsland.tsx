import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  getMainPlaybackBridge,
  subscribeMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";
import {
  getOnboardingIslandOccupied,
  subscribeOnboardingIslandOccupiedChange,
} from "@/lib/onboardingRadialBridge";
import {
  getIslandWaveformLevels,
  setIslandWaveformInactive,
  subscribeIslandWaveformLevels,
} from "@/lib/islandWaveformLevels";
import { navigateToActivityOwningSurface } from "@/lib/activityIslandResolve";
import { mainWindowPortalRoot } from "@/lib/mainWindowFrame";
import { useCurrentActivity } from "@/hooks/useCurrentActivity";
import { primaryArtist, rawArtistFromFile } from "@/components/music/musicArtist";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { DynamicIsland, type IslandState } from "./DynamicIsland";

export function ActivityIsland() {
  const activity = useCurrentActivity();
  const playback = useSyncExternalStore(
    subscribeMainPlaybackBridge,
    getMainPlaybackBridge,
    getMainPlaybackBridge,
  );
  const setActiveTab = useRuforgeStore((s) => s.setActiveTab);
  const setNavMode = useRuforgeStore((s) => s.setNavMode);
  const [userExpanded, setUserExpanded] = useState(false);
  const onboardingOccupied = useSyncExternalStore(
    subscribeOnboardingIslandOccupiedChange,
    getOnboardingIslandOccupied,
    getOnboardingIslandOccupied,
  );

  const goToOwningSurface = useCallback(() => {
    navigateToActivityOwningSurface(activity.renderState, activity.file?.path, {
      setNavMode,
      setActiveTab,
    });
  }, [activity.renderState, activity.file?.path, setNavMode, setActiveTab]);
  const hasSession = activity.hasSession;
  const canExpand = hasSession && activity.awayFromOwningSurface;
  const isExpanded = userExpanded && canExpand;

  const showIslandChrome = activity.awayFromOwningSurface || isExpanded;

  const islandState: IslandState = !hasSession || !showIslandChrome
    ? "idle"
    : isExpanded
      ? "expanded"
      : "compact";

  useEffect(() => {
    if (!canExpand) setUserExpanded(false);
  }, [canExpand]);

  useEffect(() => {
    if (!hasSession) setUserExpanded(false);
  }, [hasSession]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isExpanded]);

  const handlePlayPause = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (activity.isStub) {
        goToOwningSurface();
        return;
      }
      if (playback?.togglePlay) {
        playback.togglePlay();
        return;
      }
      goToOwningSurface();
    },
    [activity.isStub, playback, goToOwningSurface],
  );
  const handleSeekProgress = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!playback?.seek || activity.duration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      playback.seek(ratio * activity.duration);
    },
    [activity.duration, playback],
  );

  const handleOpenPlayer = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goToOwningSurface();
    },
    [goToOwningSurface],
  );
  const title = activity.file?.name ?? "Unknown";
  const subtitle =
    activity.file && activity.renderState === "main-music"
      ? primaryArtist(rawArtistFromFile(activity.file)) || null
      : null;

  const progress =
    activity.duration > 0
      ? Math.min(100, (activity.currentTime / activity.duration) * 100)
      : 0;

  const waveformPaused = activity.isStub || activity.paused;

  const waveformLevels = useSyncExternalStore(
    subscribeIslandWaveformLevels,
    getIslandWaveformLevels,
    getIslandWaveformLevels,
  );

  useEffect(() => {
    setIslandWaveformInactive(waveformPaused);
  }, [waveformPaused]);

  const settingsAccent = useRuforgeStore((s) =>
    typeof s.settings.accentColor === "string" ? s.settings.accentColor : "#EDCF9B",
  );

  const content = useMemo(
    () => ({
      coverSrc: activity.coverSrc,
      title,
      subtitle,
      stubLabel: activity.stubLabel,
      paused: activity.paused,
      waveformPaused,
      accentColor: settingsAccent,
      currentTime: activity.currentTime,
      duration: activity.duration,
      progress,
      showSkip: activity.renderState === "main-music",
      showExpandedControls: isExpanded && !activity.isStub && hasSession,
      hasPrev: Boolean(playback?.hasPrevInQueue),
      hasNext: Boolean(playback?.hasNextInQueue),
      isStub: activity.isStub,
      canSeek: Boolean(playback?.seek) && activity.duration > 0 && !activity.isStub,
    }),
    [
      activity.coverSrc,
      title,
      subtitle,
      activity.stubLabel,
      activity.paused,
      waveformPaused,
      settingsAccent,
      activity.currentTime,
      activity.duration,
      activity.renderState,
      progress,
      isExpanded,
      hasSession,
      playback?.hasPrevInQueue,
      playback?.hasNextInQueue,
      playback?.seek,
      activity.isStub,
    ],
  );

  const handleShellClick = () => {
    if (isExpanded) {
      setUserExpanded(false);
      return;
    }
    if (canExpand) setUserExpanded(true);
  };

  if (onboardingOccupied) return null;

  return createPortal(
    <>
      {isExpanded ? (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[109] bg-transparent"
          aria-label="Dismiss now playing"
          onClick={() => setUserExpanded(false)}
        />
      ) : null}

      <div
        className="pointer-events-none fixed top-0 left-1/2 z-[110] flex w-full max-w-lg -translate-x-1/2 justify-center overflow-visible pt-[6px]"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <DynamicIsland
          state={islandState}
          content={content}
          waveformLevels={waveformLevels}
          onClick={handleShellClick}
          onPlayPause={handlePlayPause}
          onSeekProgress={handleSeekProgress}
          onOpenPlayer={handleOpenPlayer}
          onSkipPrev={(e) => {
            e.stopPropagation();
            playback?.skipPrev?.();
          }}
          onSkipNext={(e) => {
            e.stopPropagation();
            playback?.skipNext?.();
          }}
        />
      </div>
    </>,
    mainWindowPortalRoot(),
  );
}

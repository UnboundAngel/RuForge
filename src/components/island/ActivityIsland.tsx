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
import { readPlaybackSpeed } from "@/playbackSpeedStorage";
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
  const navMode = useRuforgeStore((s) => s.navMode);
  const volume = useRuforgeStore((s) => s.volume);
  const isMuted = useRuforgeStore((s) => s.isMuted);
  const isLooping = useRuforgeStore((s) => s.isLooping);
  const setMuted = useRuforgeStore((s) => s.setMuted);
  const setVolume = useRuforgeStore((s) => s.setVolume);
  const setLooping = useRuforgeStore((s) => s.setLooping);
  const handlePopOut = useRuforgeStore((s) => s.handlePopOut);
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

  const livePaused = playback?.paused ?? activity.paused;
  const liveCurrentTime = playback?.currentTime ?? activity.currentTime;
  const liveDuration = activity.duration > 0 ? activity.duration : (playback?.duration ?? 0);
  const onOwningSurface = hasSession && !activity.awayFromOwningSurface;

  const showIslandChrome =
    activity.awayFromOwningSurface ||
    isExpanded ||
    (hasSession && livePaused && onOwningSurface);

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
  const handleSeek = useCallback(
    (seconds: number) => {
      if (!playback?.seek || activity.duration <= 0) return;
      playback.seek(Math.min(activity.duration, Math.max(0, seconds)));
    },
    [activity.duration, playback],
  );

  const handleBeginScrub = useCallback(() => {
    playback?.beginScrub?.();
  }, [playback]);

  const handleReleaseScrub = useCallback(
    (seconds: number) => {
      if (playback?.releaseScrub) {
        playback.releaseScrub(seconds);
        return;
      }
      handleSeek(seconds);
    },
    [playback, handleSeek],
  );

  const handleOpenPlayer = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      goToOwningSurface();
    },
    [goToOwningSurface],
  );

  const handleSkipBySeconds = useCallback(
    (delta: number) => (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!playback?.seek || activity.duration <= 0) return;
      const next = Math.min(
        activity.duration,
        Math.max(0, activity.currentTime + delta),
      );
      playback.seek(next);
    },
    [activity.currentTime, activity.duration, playback],
  );

  const handleToggleLoop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setLooping(!isLooping);
    },
    [isLooping, setLooping],
  );

  const handlePopOutClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void handlePopOut(activity.currentTime, {
        paused: activity.paused,
        playbackSpeed: readPlaybackSpeed(),
      });
    },
    [activity.currentTime, activity.paused, handlePopOut],
  );
  const title = activity.file?.name ?? "Unknown";
  const subtitle =
    activity.file && activity.renderState === "main-music"
      ? primaryArtist(rawArtistFromFile(activity.file)) || null
      : null;

  const progress =
    liveDuration > 0
      ? Math.min(100, (liveCurrentTime / liveDuration) * 100)
      : 0;

  const waveformPaused = activity.isStub || livePaused;

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
      trackKey: activity.file?.path ?? "",
      title,
      subtitle,
      stubLabel: activity.stubLabel,
      paused: livePaused,
      waveformPaused,
      accentColor: settingsAccent,
      currentTime: liveCurrentTime,
      duration: liveDuration,
      progress,
      showTrackSkip: activity.renderState === "main-music",
      showExpandedControls: isExpanded && !activity.isStub && hasSession,
      hasPrev: Boolean(playback?.hasPrevInQueue),
      hasNext: Boolean(playback?.hasNextInQueue),
      isStub: activity.isStub,
      canSeek: Boolean(playback?.seek) && liveDuration > 0 && !activity.isStub,
      isMuted,
      volume,
      isLooping,
    }),
    [
      activity.coverSrc,
      activity.file?.path,
      title,
      subtitle,
      activity.stubLabel,
      livePaused,
      waveformPaused,
      settingsAccent,
      liveCurrentTime,
      liveDuration,
      activity.renderState,
      progress,
      isExpanded,
      hasSession,
      playback?.hasPrevInQueue,
      playback?.hasNextInQueue,
      playback?.seek,
      activity.isStub,
      isMuted,
      volume,
      isLooping,
      playback?.paused,
      playback?.currentTime,
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
        className="rf-activity-island-portal pointer-events-none fixed top-0 left-1/2 z-[110] flex w-full max-w-lg -translate-x-1/2 justify-center overflow-visible pt-[6px]"
        data-rf-nav-mode={navMode === "music" ? "music" : "media"}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <DynamicIsland
          state={islandState}
          content={content}
          waveformLevels={waveformLevels}
          onClick={handleShellClick}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onBeginScrub={handleBeginScrub}
          onReleaseScrub={handleReleaseScrub}
          onOpenPlayer={handleOpenPlayer}
          onSkipPrev={(e) => {
            e.stopPropagation();
            playback?.skipPrev?.();
          }}
          onSkipNext={(e) => {
            e.stopPropagation();
            playback?.skipNext?.();
          }}
          onSkipBySeconds={handleSkipBySeconds}
          onVolume={setVolume}
          onMuted={setMuted}
          onToggleLoop={handleToggleLoop}
          onPopOut={handlePopOutClick}
        />
      </div>
    </>,
    mainWindowPortalRoot(),
  );
}

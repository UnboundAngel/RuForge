import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { useDevCaptureChrome } from "@/components/dev-captures/DevCaptureChromeProvider";
import { isDevCaptureEnabled } from "@/lib/devCaptureGate";
import { ISLAND_CAPTURE_AUTO_DISMISS_MS } from "@/lib/devCaptureDismiss";
import {
  crashPreviewCaptureContextLabel,
  devCaptureIslandCaption,
} from "@/lib/devCaptureScreenLabel";
import { useCrashRecoveryPreview } from "@/lib/crashRecoveryPreview";
import type { DevCaptureEntry } from "@/lib/devCapturesTypes";
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

type IslandSavedCapture = {
  entry: DevCaptureEntry;
  previewSrc: string;
  contextLabel: string;
};

export type ActivityIslandUpdateAvailable = {
  version: string;
  notes: string;
  installableVersion: string;
  versionOptions: readonly string[];
  selectedVersion: string;
  onSelectVersion: (version: string) => void;
  collapsed: boolean;
  onInstallRestart: () => void;
  onHideUntilRestart: () => void;
  onCollapse: () => void;
  onExpand: () => void;
};

type ActivityIslandProps = {
  updateAvailable?: ActivityIslandUpdateAvailable | null;
};

export function ActivityIsland({ updateAvailable = null }: ActivityIslandProps) {
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
  const showDebuggingSettings = useRuforgeStore((s) => s.settings.showDebuggingSettings);
  const crashRecoveryPreview = useCrashRecoveryPreview();
  const devCaptureChrome = useDevCaptureChrome();
  const devCaptureIsland =
    isDevCaptureEnabled(showDebuggingSettings) && crashRecoveryPreview != null;
  const [captureHover, setCaptureHover] = useState(false);
  const [savedCaptureHover, setSavedCaptureHover] = useState(false);
  const [savedCapture, setSavedCapture] = useState<IslandSavedCapture | null>(null);
  const islandWrapRef = useRef<HTMLDivElement>(null);
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

  const updateMode = Boolean(updateAvailable);
  const updateExpanded = updateMode && !updateAvailable!.collapsed;

  const islandState: IslandState = devCaptureIsland
    ? savedCapture
      ? "capture"
      : "idle"
    : updateMode
      ? updateAvailable!.collapsed
        ? "idle"
        : "expanded"
    : !hasSession || !showIslandChrome
      ? "idle"
      : isExpanded
        ? "expanded"
        : "compact";

  const dismissSavedCapture = useCallback(() => {
    setSavedCapture((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewSrc);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!crashRecoveryPreview) {
      dismissSavedCapture();
      setCaptureHover(false);
      setSavedCaptureHover(false);
    }
  }, [crashRecoveryPreview, dismissSavedCapture]);

  useEffect(() => {
    if (!savedCapture || savedCaptureHover) return;
    const timer = window.setTimeout(dismissSavedCapture, ISLAND_CAPTURE_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [savedCapture, savedCaptureHover, dismissSavedCapture]);

  useEffect(() => {
    return () => {
      setSavedCapture((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewSrc);
        return null;
      });
    };
  }, []);
  useEffect(() => {
    if (!canExpand) setUserExpanded(false);
  }, [canExpand]);

  useEffect(() => {
    if (!hasSession) setUserExpanded(false);
  }, [hasSession]);

  useEffect(() => {
    if (!isExpanded && !savedCapture) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (savedCapture) {
        dismissSavedCapture();
        return;
      }
      if (isExpanded) setUserExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isExpanded, savedCapture, dismissSavedCapture]);
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
    if (devCaptureIsland) return;
    if (updateMode && updateAvailable) {
      if (updateAvailable.collapsed) {
        updateAvailable.onExpand();
      } else {
        updateAvailable.onCollapse();
      }
      return;
    }
    if (isExpanded) {
      setUserExpanded(false);
      return;
    }
    if (canExpand) setUserExpanded(true);
  };

  const handleIslandCapture = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const el = islandWrapRef.current;
      if (!el || devCaptureChrome.capturing || !crashRecoveryPreview) return;
      const contextLabel = crashPreviewCaptureContextLabel(crashRecoveryPreview);
      void devCaptureChrome
        .captureFromTrigger(el.getBoundingClientRect(), contextLabel, "island")
        .then((result) => {
          if (!result || !("previewSrc" in result)) return;
          setSavedCapture((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewSrc);
            return {
              entry: result.entry,
              previewSrc: result.previewSrc,
              contextLabel: result.contextLabel,
            };
          });
        });
    },
    [devCaptureChrome, crashRecoveryPreview],
  );
  if (onboardingOccupied) return null;

  return createPortal(
    <>
      {isExpanded || updateExpanded ? (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[109] bg-transparent"
          aria-label={updateExpanded ? "Collapse update details" : "Dismiss now playing"}
          onClick={() => {
            if (updateExpanded && updateAvailable) {
              updateAvailable.onCollapse();
              return;
            }
            setUserExpanded(false);
          }}
        />
      ) : null}

      <div
        className={`rf-activity-island-portal pointer-events-none fixed top-0 left-1/2 flex w-full max-w-lg -translate-x-1/2 justify-center overflow-visible pt-[6px] ${
          crashRecoveryPreview ? "z-[100001]" : "z-[110]"
        }`}
        data-rf-nav-mode={navMode === "music" ? "music" : "media"}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div
          ref={islandWrapRef}
          className="pointer-events-auto relative"
          onMouseEnter={() => {
            if (!devCaptureIsland) return;
            if (savedCapture) setSavedCaptureHover(true);
            else setCaptureHover(true);
          }}
          onMouseLeave={() => {
            if (!devCaptureIsland) return;
            setSavedCaptureHover(false);
            if (!savedCapture) setCaptureHover(false);
          }}
        >
          <DynamicIsland
            state={islandState}
            content={content}
            waveformLevels={waveformLevels}
            updateAvailable={
              updateAvailable
                ? {
                    version: updateAvailable.version,
                    notes: updateAvailable.notes,
                    installableVersion: updateAvailable.installableVersion,
                    versionOptions: updateAvailable.versionOptions,
                    selectedVersion: updateAvailable.selectedVersion,
                    onSelectVersion: updateAvailable.onSelectVersion,
                    collapsed: updateAvailable.collapsed,
                    onInstallRestart: updateAvailable.onInstallRestart,
                    onHideUntilRestart: updateAvailable.onHideUntilRestart,
                  }
                : undefined
            }
            devCaptureIdle={
              devCaptureIsland && !savedCapture
                ? {
                    hover: captureHover,
                    busy: devCaptureChrome.capturing,
                    onCapture: handleIslandCapture,
                  }
                : undefined
            }
            captureSavedCaption={
              savedCapture ? devCaptureIslandCaption(savedCapture.contextLabel) : undefined
            }
            captureSavedPreviewSrc={savedCapture?.previewSrc}
            onCaptureSavedOpen={(e) => {
              e.stopPropagation();
              if (savedCapture) devCaptureChrome.openCapture(savedCapture.entry);
            }}
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
      </div>
    </>,
    mainWindowPortalRoot(),
  );
}

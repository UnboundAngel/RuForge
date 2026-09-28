import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { DynamicIsland, type DynamicIslandContent } from "@/components/island/DynamicIsland";
import { AppTooltipLayer } from "@/components/ui/TooltipLayer";
import {
  emitDesktopIslandControl,
  listenDesktopIslandState,
  restoreMainFromDesktopIsland,
  type DesktopIslandStatePayload,
} from "@/lib/desktopIslandBridge";
import { resolveOverlayIslandState, type IslandExpandedTarget } from "@/lib/islandOverlayState";
import { noteIslandSkipDir } from "@/lib/islandSkipDirection";
import { useOverlayWaveformLevels } from "@/hooks/useOverlayWaveformLevels";

const COMPACT_BOUNDS = { width: 380, height: 56 };
const EXPANDED_BOUNDS = { width: 380, height: 220 };
/** Rust clamps island bounds to 420x280; the 248px panel plus the 8px top inset fits. */
const WATCHLIST_EXPANDED_BOUNDS = { width: 380, height: 272 };

const EMPTY_CONTENT: DynamicIslandContent = {
  coverSrc: null,
  trackKey: "",
  title: "",
  subtitle: null,
  stubLabel: null,
  paused: true,
  waveformPaused: true,
  accentColor: "#EDCF9B",
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

export default function IslandOverlayApp() {
  const [payload, setPayload] = useState<DesktopIslandStatePayload | null>(null);
  const [expandedTarget, setExpandedTarget] = useState<IslandExpandedTarget>(null);

  useEffect(() => {
    document.documentElement.classList.add("ruforge-island-root");
    return () => {
      document.documentElement.classList.remove("ruforge-island-root");
    };
  }, []);

  useEffect(() => {
    void invoke("island_overlay_ready").catch(() => {});
    const unlisten = listenDesktopIslandState((next) => {
      setPayload((prev) => {
        if (
          next.skipDir != null &&
          next.content.trackKey &&
          next.content.trackKey !== prev?.content.trackKey
        ) {
          noteIslandSkipDir(next.skipDir);
        }
        return next;
      });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const hasSession = Boolean(payload?.content.trackKey);
  const download = payload?.download ?? null;
  const notice = payload?.notice ?? null;
  const watchlist = payload?.watchlist ?? null;
  const visible = hasSession || download != null || notice != null || watchlist != null;
  const islandState = resolveOverlayIslandState({
    expandedTarget,
    hasSession,
    hasNotice: notice != null,
    hasDownload: download != null,
    watchlist,
  });
  const isExpanded = islandState === "expanded";
  const anyExpanded = isExpanded || islandState === "watchlist-expanded";

  useEffect(() => {
    if (!hasSession) setExpandedTarget((t) => (t === "music" ? null : t));
  }, [hasSession]);

  useEffect(() => {
    if (!watchlist) setExpandedTarget((t) => (t === "watchlist" ? null : t));
  }, [watchlist]);

  useEffect(() => {
    const bounds =
      islandState === "watchlist-expanded"
        ? WATCHLIST_EXPANDED_BOUNDS
        : isExpanded
          ? EXPANDED_BOUNDS
          : COMPACT_BOUNDS;
    void invoke("sync_island_overlay_bounds", bounds).catch(() => {});
  }, [islandState, isExpanded]);

  useEffect(() => {
    if (!anyExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedTarget(null);
    };
    const collapse = () => setExpandedTarget(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", collapse);
    const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) collapse();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", collapse);
      void unlistenFocus.then((fn) => fn());
    };
  }, [anyExpanded]);

  const content: DynamicIslandContent = payload
    ? {
        ...payload.content,
        showExpandedControls: isExpanded && !payload.content.isStub,
      }
    : EMPTY_CONTENT;

  const waveformLevels = useOverlayWaveformLevels(
    content.waveformPaused || content.paused,
    payload?.waveformLevels ?? [],
  );

  const handleShellClick = useCallback(() => {
    if (islandState === "watchlist") {
      setExpandedTarget("watchlist");
      return;
    }
    if (islandState === "watchlist-expanded") {
      setExpandedTarget(null);
      return;
    }
    if (!hasSession) {
      void restoreMainFromDesktopIsland();
      return;
    }
    setExpandedTarget((prev) => (prev === "music" ? null : "music"));
  }, [hasSession, islandState]);

  const handleWatchlistQueue = useCallback((videoId: string) => {
    void emitDesktopIslandControl({ type: "watchlistQueue", videoId });
  }, []);

  const handleWatchlistOpen = useCallback(async (videoId: string) => {
    await restoreMainFromDesktopIsland();
    void emitDesktopIslandControl({ type: "watchlistOpen", videoId });
  }, []);

  const handleWatchlistMarkAllSeen = useCallback(() => {
    void emitDesktopIslandControl({ type: "watchlistMarkAllSeen" });
  }, []);

  const handleWatchlistShowMore = useCallback(async () => {
    await restoreMainFromDesktopIsland();
    void emitDesktopIslandControl({ type: "watchlistShowAll" });
  }, []);

  const handlePlayPause = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    void emitDesktopIslandControl({ type: "togglePlay" });
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    void emitDesktopIslandControl({ type: "seek", seconds });
  }, []);

  const handleBeginScrub = useCallback(() => {
    void emitDesktopIslandControl({ type: "beginScrub" });
  }, []);

  const handleReleaseScrub = useCallback((seconds: number) => {
    void emitDesktopIslandControl({ type: "releaseScrub", seconds });
  }, []);

  const handleOpenPlayer = useCallback(async (e: MouseEvent) => {
    e.stopPropagation();
    await restoreMainFromDesktopIsland();
    void emitDesktopIslandControl({ type: "openPlayer" });
  }, []);

  const handleSkipBySeconds = useCallback(
    (delta: number) => (e: MouseEvent) => {
      e.stopPropagation();
      void emitDesktopIslandControl({ type: "skipBy", delta });
    },
    [],
  );

  const handleToggleLoop = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    void emitDesktopIslandControl({ type: "loop" });
  }, []);

  const handlePopOut = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    void emitDesktopIslandControl({ type: "popOut" });
  }, []);

  if (!visible) {
    return <div className="h-full w-full bg-transparent" />;
  }

  return (
    <div className="pointer-events-none flex h-full w-full justify-center overflow-visible bg-transparent pt-[8px]">
      <div className="pointer-events-auto">
        <DynamicIsland
          state={islandState}
          content={content}
          waveformLevels={waveformLevels}
          skipDirHint={payload?.skipDir ?? null}
          download={download}
          notice={notice}
          watchlist={watchlist}
          onWatchlistQueue={handleWatchlistQueue}
          onWatchlistOpen={(id) => void handleWatchlistOpen(id)}
          onWatchlistMarkAllSeen={handleWatchlistMarkAllSeen}
          onWatchlistShowMore={() => void handleWatchlistShowMore()}
          onClick={handleShellClick}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onBeginScrub={handleBeginScrub}
          onReleaseScrub={handleReleaseScrub}
          onOpenPlayer={handleOpenPlayer}
          onSkipPrev={(e) => {
            e.stopPropagation();
            void emitDesktopIslandControl({ type: "skipPrev" });
          }}
          onSkipNext={(e) => {
            e.stopPropagation();
            void emitDesktopIslandControl({ type: "skipNext" });
          }}
          onSkipBySeconds={handleSkipBySeconds}
          onVolume={(volume) => {
            void emitDesktopIslandControl({ type: "volume", volume });
          }}
          onMuted={(muted) => {
            void emitDesktopIslandControl({ type: "muted", muted });
          }}
          onToggleLoop={handleToggleLoop}
          onAudioOutput={(deviceId) => {
            void emitDesktopIslandControl({ type: "audioOutput", deviceId });
          }}
          onPopOut={handlePopOut}
        />
      </div>
      <AppTooltipLayer />
    </div>
  );
}

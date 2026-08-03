import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState, type MouseEvent } from "react";

import {
  DynamicIsland,
  type DynamicIslandContent,
  type IslandState,
} from "@/components/island/DynamicIsland";
import {
  emitDesktopIslandControl,
  listenDesktopIslandState,
  restoreMainFromDesktopIsland,
  type DesktopIslandStatePayload,
} from "@/lib/desktopIslandBridge";
import { noteIslandSkipDir } from "@/lib/islandSkipDirection";
import { useOverlayWaveformLevels } from "@/hooks/useOverlayWaveformLevels";

const COMPACT_BOUNDS = { width: 380, height: 56 };
const EXPANDED_BOUNDS = { width: 380, height: 220 };

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
  const [userExpanded, setUserExpanded] = useState(false);

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
  const isExpanded = userExpanded && hasSession;
  const islandState: IslandState = !hasSession ? "idle" : isExpanded ? "expanded" : "compact";

  useEffect(() => {
    if (!hasSession) setUserExpanded(false);
  }, [hasSession]);

  useEffect(() => {
    const bounds = isExpanded ? EXPANDED_BOUNDS : COMPACT_BOUNDS;
    void invoke("sync_island_overlay_bounds", bounds).catch(() => {});
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserExpanded(false);
    };
    const collapse = () => setUserExpanded(false);
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
  }, [isExpanded]);

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
    if (!hasSession) return;
    setUserExpanded((prev) => !prev);
  }, [hasSession]);

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

  if (!hasSession) {
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
    </div>
  );
}

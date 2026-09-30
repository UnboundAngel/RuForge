import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

import type { MainPlaybackBridgeOwner } from "@/playback/bridgeArbitration";
import {
  getMainPlaybackBridge,
  getMainPlaybackBridgeOwner,
  publishMainPlaybackBridge,
} from "@/lib/mainPlaybackBridge";

export type MainPlaybackSnapshot = {
  paused: boolean;
  currentTime: number;
  duration: number;
  /** Identifies the loaded track so a restart at 0 on a new track is not mistaken for a time glitch. */
  mediaKey?: string | null;
  togglePlay?: () => void;
  seek?: (seconds: number) => void;
  beginScrub?: () => void;
  releaseScrub?: (seconds: number) => void;
  skipPrev?: () => void;
  skipNext?: () => void;
  hasPrevInQueue?: boolean;
  hasNextInQueue?: boolean;
};

const MainPlaybackContext = createContext<MainPlaybackSnapshot | null>(null);

export function MainPlaybackProvider({
  bridgeOwner,
  active,
  liveTelemetry = false,
  value,
  children,
}: {
  bridgeOwner: MainPlaybackBridgeOwner;
  active: boolean;
  /** When true, only callbacks/queue flags publish here; time/paused come from live media patches. */
  liveTelemetry?: boolean;
  value: MainPlaybackSnapshot;
  children: ReactNode;
}) {
  const latestRef = useRef(value);
  latestRef.current = value;

  useLayoutEffect(() => {
    if (!active) {
      publishMainPlaybackBridge(bridgeOwner, null);
      return;
    }

    const v = latestRef.current;
    const existing =
      liveTelemetry && getMainPlaybackBridgeOwner() === bridgeOwner
        ? getMainPlaybackBridge()
        : null;

    publishMainPlaybackBridge(bridgeOwner, {
      paused: existing?.paused ?? v.paused,
      currentTime: existing?.currentTime ?? v.currentTime,
      duration: existing?.duration ?? v.duration,
      mediaKey: v.mediaKey,
      hasPrevInQueue: v.hasPrevInQueue,
      hasNextInQueue: v.hasNextInQueue,
      togglePlay: () => latestRef.current.togglePlay?.(),
      seek: (seconds: number) => latestRef.current.seek?.(seconds),
      beginScrub: () => latestRef.current.beginScrub?.(),
      releaseScrub: (seconds: number) => latestRef.current.releaseScrub?.(seconds),
      skipPrev: () => latestRef.current.skipPrev?.(),
      skipNext: () => latestRef.current.skipNext?.(),
    });
  }, [
    bridgeOwner,
    active,
    liveTelemetry,
    value.mediaKey,
    value.hasPrevInQueue,
    value.hasNextInQueue,
    ...(liveTelemetry
      ? []
      : [value.paused, value.currentTime, value.duration]),
  ]);

  useEffect(
    () => () => {
      publishMainPlaybackBridge(bridgeOwner, null);
    },
    [bridgeOwner],
  );

  return (
    <MainPlaybackContext.Provider value={value}>{children}</MainPlaybackContext.Provider>
  );
}

export function useMainPlaybackContext(): MainPlaybackSnapshot | null {
  return useContext(MainPlaybackContext);
}

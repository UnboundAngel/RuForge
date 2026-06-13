import { createContext, useContext, useEffect, type ReactNode } from "react";

import type { MainPlaybackBridgeOwner } from "@/playback/bridgeArbitration";
import { publishMainPlaybackBridge } from "@/lib/mainPlaybackBridge";

export type MainPlaybackSnapshot = {
  paused: boolean;
  currentTime: number;
  duration: number;
  togglePlay?: () => void;
  skipPrev?: () => void;
  skipNext?: () => void;
  hasPrevInQueue?: boolean;
  hasNextInQueue?: boolean;
};

const MainPlaybackContext = createContext<MainPlaybackSnapshot | null>(null);

export function MainPlaybackProvider({
  bridgeOwner,
  active,
  value,
  children,
}: {
  bridgeOwner: MainPlaybackBridgeOwner;
  active: boolean;
  value: MainPlaybackSnapshot;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!active) {
      publishMainPlaybackBridge(bridgeOwner, null);
      return;
    }
    publishMainPlaybackBridge(bridgeOwner, value);
  }, [bridgeOwner, active, value]);

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

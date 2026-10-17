import { useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";

/**
 * Key for MusicShell's detail AnimatePresence. The shell stays mounted under a hidden
 * <Activity> outside music mode, where effects are torn down, so a mode="wait" exit started
 * there (profile chip from the video library) never completes and the old page sticks.
 * Remounting on a hidden-time change shows the new page directly. StrictMode masks this in dev.
 */
export function useMusicDetailSwapKey(): number {
  const musicDetail = useRuforgeStore((s) => s.musicDetail);
  const visible = useRuforgeStore((s) => s.navMode === "music");
  const [seen, setSeen] = useState(musicDetail);
  const [key, setKey] = useState(0);
  if (seen !== musicDetail) {
    setSeen(musicDetail);
    if (!visible) setKey((k) => k + 1);
  }
  return key;
}

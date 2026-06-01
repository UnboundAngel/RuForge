import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MUSIC_MINI_PINNED_KEY } from "./musicMiniConstants";

function readPinned(): boolean {
  try {
    return localStorage.getItem(MUSIC_MINI_PINNED_KEY) === "1";
  } catch {
    return false;
  }
}

export function useMusicMiniWindowChrome() {
  const [isPinned, setIsPinned] = useState(readPinned);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    void win.setAlwaysOnTop(isPinned).catch(() => {});
    try {
      localStorage.setItem(MUSIC_MINI_PINNED_KEY, isPinned ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [isPinned]);

  const togglePin = useCallback(() => setIsPinned((p) => !p), []);

  const startDrag = useCallback(() => {
    void getCurrentWindow().startDragging().catch(() => {});
  }, []);

  return { isPinned, togglePin, startDrag };
}

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { syncMainWindowTransparentFrame } from "@/lib/mainWindowFrame";

export function useMainWindowTransparentFrame(isMaximized: boolean): void {
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    syncMainWindowTransparentFrame(!isMaximized);
  }, [isMaximized]);
}

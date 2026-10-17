import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useMainWindowMaximized(): boolean {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    if (win.label !== "main") return;

    const sync = () => {
      void win.isMaximized().then(setIsMaximized);
    };
    sync();

    const unlisten = win.onResized(sync);

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return isMaximized;
}

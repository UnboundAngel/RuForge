import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type RemovableDrivesPollResult = {
  drives: string[];
  defaultDest: string | null;
};

const POLL_MS = 1500;

export function useRemovableDrivesPoll(): {
  removableDrives: string[];
  defaultRemovableDest: string | null;
} {
  const [removableDrives, setRemovableDrives] = useState<string[]>([]);
  const [defaultRemovableDest, setDefaultRemovableDest] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;

    let disposed = false;

    const tick = async () => {
      try {
        const result = await invoke<RemovableDrivesPollResult>("poll_removable_drives");
        if (disposed) return;
        setRemovableDrives(result.drives);
        setDefaultRemovableDest(result.defaultDest);
      } catch (e) {
        console.error("poll_removable_drives failed:", e);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, []);

  return { removableDrives, defaultRemovableDest };
}

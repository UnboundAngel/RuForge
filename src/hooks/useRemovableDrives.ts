import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type RemovableDrivesSnapshot = {
  drives: string[];
  defaultDest: string | null;
};

const REMOVABLE_DRIVES_CHANGED_EVENT = "removable-drives-changed";

/** Removable drives as Rust sees them: one read on mount, then pushed only when they change. */
export function useRemovableDrives(): {
  removableDrives: string[];
  defaultRemovableDest: string | null;
} {
  const [snapshot, setSnapshot] = useState<RemovableDrivesSnapshot>({ drives: [], defaultDest: null });

  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;

    let disposed = false;
    // An event that lands before the initial read resolves is newer, so it wins.
    let gotEvent = false;
    const unlisten = listen<RemovableDrivesSnapshot>(REMOVABLE_DRIVES_CHANGED_EVENT, (e) => {
      gotEvent = true;
      if (!disposed) setSnapshot(e.payload);
    });
    invoke<RemovableDrivesSnapshot>("get_removable_drives")
      .then((initial) => {
        if (!disposed && !gotEvent) setSnapshot(initial);
      })
      .catch((e) => console.error("get_removable_drives failed:", e));

    return () => {
      disposed = true;
      void unlisten.then((off) => off());
    };
  }, []);

  return { removableDrives: snapshot.drives, defaultRemovableDest: snapshot.defaultDest };
}

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DevCaptureEntry } from "../lib/devCapturesTypes";

const POLL_MS = 2000;

export function useDevCapturesList(enabled: boolean) {
  const [entries, setEntries] = useState<DevCaptureEntry[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [list, folder] = await Promise.all([
        invoke<DevCaptureEntry[]>("list_dev_captures"),
        invoke<string>("dev_captures_folder_path"),
      ]);
      setEntries(list);
      setFolderPath(folder);
    } catch (e) {
      console.error("[dev-captures] list failed", e);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setFolderPath("");
      return;
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    let unlistenFocus: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) void refresh();
      })
      .then((fn) => {
        unlistenFocus = fn;
      })
      .catch(() => {});

    return () => {
      window.clearInterval(interval);
      unlistenFocus?.();
    };
  }, [enabled, refresh]);

  return { entries, folderPath, loading, refresh };
}

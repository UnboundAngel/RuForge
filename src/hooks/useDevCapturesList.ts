import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DevCaptureEntry } from "../lib/devCapturesTypes";
import { DEV_CAPTURES_CHANGED_EVENT } from "../lib/devCapturesEvents";

let cachedEntries: DevCaptureEntry[] = [];
let cachedFolderPath = "";

function entriesEqual(a: DevCaptureEntry[], b: DevCaptureEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.path !== right.path ||
      left.modifiedMs !== right.modifiedMs ||
      left.name !== right.name
    ) {
      return false;
    }
  }
  return true;
}

export function useDevCapturesList(enabled: boolean) {
  const [entries, setEntries] = useState<DevCaptureEntry[]>(() =>
    enabled ? cachedEntries : [],
  );
  const [folderPath, setFolderPath] = useState(() =>
    enabled ? cachedFolderPath : "",
  );
  const [loading, setLoading] = useState(
    () => enabled && cachedEntries.length === 0,
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;

    const showLoading = cachedEntries.length === 0;
    if (showLoading) setLoading(true);

    try {
      const [list, folder] = await Promise.all([
        invoke<DevCaptureEntry[]>("list_dev_captures"),
        invoke<string>("dev_captures_folder_path"),
      ]);

      if (!entriesEqual(list, cachedEntries)) {
        cachedEntries = list;
        setEntries(list);
      }
      if (folder !== cachedFolderPath) {
        cachedFolderPath = folder;
        setFolderPath(folder);
      }
    } catch (e) {
      console.error("[dev-captures] list failed", e);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      cachedEntries = [];
      cachedFolderPath = "";
      setEntries([]);
      setFolderPath("");
      setLoading(false);
      return;
    }

    setEntries(cachedEntries);
    setFolderPath(cachedFolderPath);
    setLoading(cachedEntries.length === 0);

    void refresh();

    const onChanged = () => {
      void refresh();
    };
    window.addEventListener(DEV_CAPTURES_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(DEV_CAPTURES_CHANGED_EVENT, onChanged);
    };
  }, [enabled, refresh]);

  return { entries, folderPath, loading, refresh };
}

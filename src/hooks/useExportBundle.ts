import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { gatherExportPlaybackEntries } from "../exportPlaybackGather";
import { resolveExportMediaPaths } from "../lib/exportSelection";
import type {
  ExportBundleProgressPayload,
  ExportMediaBundleResult,
} from "../lib/exportTypes";
import { writeExportLastDestDir } from "../lib/exportTypes";
import { useRuforgeStore } from "../store/ruforgeStore";

function invokeErrorMessage(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function useExportBundle() {
  const setExportProgress = useRuforgeStore((s) => s.setExportProgress);
  const setExportInFlight = useRuforgeStore((s) => s.setExportInFlight);
  const setExportOutcome = useRuforgeStore((s) => s.setExportOutcome);
  const resetExportOutcome = useRuforgeStore((s) => s.resetExportOutcome);
  const notify = useRuforgeStore((s) => s.notify);

  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;

    let unsub: (() => void) | undefined;
    let disposed = false;

    void listen<ExportBundleProgressPayload>("export-bundle-progress", (event) => {
      setExportProgress(event.payload);
    }).then((un) => {
      if (disposed) {
        un();
        return;
      }
      unsub = un;
    });

    return () => {
      disposed = true;
      unsub?.();
    };
  }, [setExportProgress]);

  const pickDestDir = useCallback(async (): Promise<string | null> => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") return selected;
    return null;
  }, []);

  const cancelExport = useCallback(async () => {
    try {
      await invoke("cancel_export_bundle");
    } catch (e) {
      console.error("cancel_export_bundle failed:", e);
    }
  }, []);

  const startExport = useCallback(
    async (args: { paths: string[]; destDir: string; includeManifest: boolean }) => {
      const { paths, destDir, includeManifest } = args;
      if (!destDir.trim()) return;

      if (useRuforgeStore.getState().exportInFlight) {
        notify("An export is already running.", "warning");
        return;
      }

      resetExportOutcome();
      setExportInFlight(true);
      setExportProgress({
        phase: "preparing",
        fileIndex: 0,
        fileTotal: 0,
        bytesCopied: 0,
      });

      writeExportLastDestDir(destDir);

      try {
        const entries = useRuforgeStore.getState().entries;
        const playbackPaths = resolveExportMediaPaths(paths, entries);
        const playbackEntries = gatherExportPlaybackEntries(playbackPaths);
        const result = await invoke<ExportMediaBundleResult>("export_media_bundle", {
          options: {
            paths,
            destDir,
            includeManifest,
            playbackEntries,
          },
        });

        if (result.cancelled) {
          setExportOutcome({ kind: "cancelled", result });
        } else {
          setExportOutcome({ kind: "done", result });
        }
      } catch (e) {
        const error = invokeErrorMessage(e, "Export failed.");
        setExportOutcome({ kind: "failed", error });
      } finally {
        setExportInFlight(false);
      }
    },
    [
      notify,
      resetExportOutcome,
      setExportInFlight,
      setExportOutcome,
      setExportProgress,
    ],
  );

  return { startExport, cancelExport, pickDestDir };
}

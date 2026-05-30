import type { PersistStorage, StorageValue } from "zustand/middleware";
import {
  LS_LIBRARY_SCAN_DIRS,
  readLibraryScanDirsFromLs,
  writeLibraryScanDirsToLs,
} from "../libraryScanDirs";
import type { RuforgeSettings } from "./types";
import { DEFAULT_OUTPUT_DIR, loadMergedSettings } from "./types";

const LS_SETTINGS = "ruforge-settings";
const LS_OUTPUT = "ruforge-output-dir";
const LS_INTERNAL = "ruforge-save-internal";

/** Subset of the main store written through `persist` + `partialize`. */
export type RuforgePersistedSubset = {
  settings: RuforgeSettings;
  outputDir: string;
  saveToInternal: boolean;
  libraryScanDirs: string[];
};

/**
 * Zustand `persist` passes/receives `StorageValue<S>` (`{ state, version? }`).
 * On disk, `ruforge-settings` must remain a flat JSON object (same keys as before)
 * so MiniPlayer, audioPlaybackPrefs, and localVideoSubtitles keep working.
 *
 * `persist` calls `setItem` after every `set()` on the store; `partialize` only narrows
 * the payload — it does not skip writes when nav/notify/etc. change. We diff against
 * the last serialized values so identical persisted snapshots skip `localStorage` I/O
 * (e.g. every keystroke in gallery search).
 */
export function createRuforgePersistStorage(): PersistStorage<RuforgePersistedSubset> {
  let lastWrittenSettings: string | null = null;
  let lastWrittenOutput: string | null = null;
  let lastWrittenInternal: string | null = null;
  let lastWrittenScanDirs: string | null = null;

  return {
    getItem: (_name) => {
      const settings = loadMergedSettings();
      const outputDir = localStorage.getItem(LS_OUTPUT) || DEFAULT_OUTPUT_DIR;
      const saveToInternal = localStorage.getItem(LS_INTERNAL) !== "false";
      const libraryScanDirs = readLibraryScanDirsFromLs();
      const value: StorageValue<RuforgePersistedSubset> = {
        state: { settings, outputDir, saveToInternal, libraryScanDirs },
        version: 0,
      };
      return value;
    },
    setItem: (_name, value: StorageValue<RuforgePersistedSubset>) => {
      const settingsStr = JSON.stringify(value.state.settings);
      if (settingsStr !== lastWrittenSettings) {
        localStorage.setItem(LS_SETTINGS, settingsStr);
        lastWrittenSettings = settingsStr;
      }
      if (value.state.outputDir !== lastWrittenOutput) {
        localStorage.setItem(LS_OUTPUT, value.state.outputDir);
        lastWrittenOutput = value.state.outputDir;
      }
      const internalStr = value.state.saveToInternal.toString();
      if (internalStr !== lastWrittenInternal) {
        localStorage.setItem(LS_INTERNAL, internalStr);
        lastWrittenInternal = internalStr;
      }
      const scanStr = JSON.stringify(value.state.libraryScanDirs);
      if (scanStr !== lastWrittenScanDirs) {
        writeLibraryScanDirsToLs(value.state.libraryScanDirs);
        lastWrittenScanDirs = scanStr;
      }
    },
    removeItem: (_name) => {
      localStorage.removeItem(LS_SETTINGS);
      localStorage.removeItem(LS_OUTPUT);
      localStorage.removeItem(LS_INTERNAL);
      localStorage.removeItem(LS_LIBRARY_SCAN_DIRS);
      lastWrittenSettings = null;
      lastWrittenOutput = null;
      lastWrittenInternal = null;
      lastWrittenScanDirs = null;
    },
  };
}

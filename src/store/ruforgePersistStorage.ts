import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { RuforgeSettings } from "./types";
import { loadMergedSettings } from "./types";

/** Subset of the main store written through `persist` + `partialize`. */
export type RuforgePersistedSubset = {
  settings: RuforgeSettings;
};

/**
 * Zustand `persist` passes/receives `StorageValue<S>` (`{ state, version? }`).
 * Library path config (`outputDir`, scan roots, vault preference) is owned by
 * Rust (`library_get_config` / `library_set_config`); it is intentionally
 * excluded from this persist slice.
 */
export function createRuforgePersistStorage(): PersistStorage<RuforgePersistedSubset> {
  let lastWrittenSettings: string | null = null;

  return {
    getItem: (_name) => {
      const settings = loadMergedSettings();
      const value: StorageValue<RuforgePersistedSubset> = {
        state: { settings },
        version: 0,
      };
      return value;
    },
    setItem: (_name, value: StorageValue<RuforgePersistedSubset>) => {
      const settingsStr = JSON.stringify(value.state.settings);
      if (settingsStr !== lastWrittenSettings) {
        localStorage.setItem("ruforge-settings", settingsStr);
        lastWrittenSettings = settingsStr;
      }
    },
    removeItem: (_name) => {
      localStorage.removeItem("ruforge-settings");
      lastWrittenSettings = null;
    },
  };
}

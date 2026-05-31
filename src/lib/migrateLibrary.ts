import { invoke } from "@tauri-apps/api/core";

export interface MoveRecord {
  oldMediaPath: string;
  newMediaPath: string;
  bucket: string;
}

export interface MigrateResult {
  moves: MoveRecord[];
  warnings: string[];
  dryRun: boolean;
  bucketDirsCreated: string[];
}

export async function migrateLibraryLayout(
  root: string,
  dryRun: boolean,
): Promise<MigrateResult> {
  return invoke<MigrateResult>("migrate_library_layout", {
    options: { root, dryRun },
  });
}

/** Remap every path-keyed localStorage entry for the moved media files. */
export function remapMigrationLocalStorage(moves: MoveRecord[]): void {
  if (moves.length === 0) return;
  const keyPrefixes = [
    "ruforge-playback-pos:",
    "ruforge-playback-dur:",
    "ruforge-loop:",
    "views-",
  ];
  for (const { oldMediaPath, newMediaPath } of moves) {
    for (const prefix of keyPrefixes) {
      const oldKey = `${prefix}${oldMediaPath}`;
      const value = localStorage.getItem(oldKey);
      if (value !== null) {
        localStorage.setItem(`${prefix}${newMediaPath}`, value);
        localStorage.removeItem(oldKey);
      }
    }
  }
}

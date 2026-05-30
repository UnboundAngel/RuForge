import { invoke } from "@tauri-apps/api/core";
import { readExportLastDestDir } from "./exportTypes";

async function destDirExists(path: string): Promise<boolean> {
  const trimmed = path.trim();
  if (!trimmed) return false;
  try {
    return await invoke<boolean>("export_dest_dir_available", { path: trimmed });
  } catch {
    return false;
  }
}

/** USB title-bar open: prefer removable default, else last remembered (B2). */
export async function resolveExportDestForUsbOpen(
  defaultRemovableDest: string | null,
): Promise<string | undefined> {
  if (defaultRemovableDest && (await destDirExists(defaultRemovableDest))) {
    return defaultRemovableDest;
  }
  const remembered = readExportLastDestDir();
  if (remembered && (await destDirExists(remembered))) {
    return remembered;
  }
  return undefined;
}

/** Modal open: preset override when still on disk, else B2. */
export async function resolveExportInitialDestDir(
  preferred: string | undefined,
): Promise<string> {
  if (preferred?.trim() && (await destDirExists(preferred))) {
    return preferred.trim();
  }
  const remembered = readExportLastDestDir();
  if (remembered && (await destDirExists(remembered))) {
    return remembered;
  }
  return remembered;
}

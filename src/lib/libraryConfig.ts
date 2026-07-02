import { invoke } from "@tauri-apps/api/core";
import type { GalleryEntry } from "../types";
import { DEFAULT_OUTPUT_DIR, RUFORGE_INTERNAL_DIR } from "../store/types";

export type LibraryConfig = {
  internalVault: string;
  outputDir: string;
  saveToInternal: boolean;
  extraScanDirs: string[];
  legacyImportDone: boolean;
};

export type LibraryConfigPatch = {
  outputDir?: string;
  saveToInternal?: boolean;
  extraScanDirs?: string[];
  markLegacyImportDone?: boolean;
};

export type LibrarySnapshot = {
  version: string;
  ready: boolean;
  entries: GalleryEntry[];
};

export function normalizeScanDirKey(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Internal vault plus user-added scan roots (deduped). Mirrors Rust `effective_roots`. */
export function galleryScanRoots(cfg: {
  internalVault: string;
  extraScanDirs: string[];
}): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  const push = (dir: string) => {
    const trimmed = dir.trim();
    if (!trimmed) return;
    const key = normalizeScanDirKey(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    roots.push(trimmed);
  };
  push(cfg.internalVault);
  for (const d of cfg.extraScanDirs) {
    push(d);
  }
  return roots;
}

export function galleryScanRootsFromStore(state: {
  internalVault: string;
  libraryScanDirs: string[];
}): string[] {
  return galleryScanRoots({
    internalVault: state.internalVault,
    extraScanDirs: state.libraryScanDirs,
  });
}

export function isDirInLibraryScanList(
  dir: string,
  cfg: { internalVault: string; extraScanDirs: string[] },
): boolean {
  const key = normalizeScanDirKey(dir);
  return galleryScanRoots(cfg).some((r) => normalizeScanDirKey(r) === key);
}

function parseLegacyScanDirsJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is string => typeof d === "string" && d.trim() !== "");
  } catch {
    return [];
  }
}

/** One-shot read of browser-side library prefs before Rust owns config. */
export function readLegacyLibraryConfigPatch(): LibraryConfigPatch {
  const outputDir = localStorage.getItem("ruforge-output-dir")?.trim() || DEFAULT_OUTPUT_DIR;
  const saveToInternal = localStorage.getItem("ruforge-save-internal") !== "false";
  const seeded = localStorage.getItem("ruforge-library-scan-dirs-seeded-v2");
  let extraScanDirs: string[];
  if (seeded) {
    extraScanDirs = parseLegacyScanDirsJson(localStorage.getItem("ruforge-library-scan-dirs"));
  } else {
    const internalKey = normalizeScanDirKey(RUFORGE_INTERNAL_DIR);
    extraScanDirs =
      outputDir && normalizeScanDirKey(outputDir) !== internalKey ? [outputDir] : [];
  }
  return { outputDir, saveToInternal, extraScanDirs };
}

export function libraryConfigToStoreFields(cfg: LibraryConfig): {
  internalVault: string;
  outputDir: string;
  saveToInternal: boolean;
  libraryScanDirs: string[];
} {
  return {
    internalVault: cfg.internalVault,
    outputDir: cfg.outputDir,
    saveToInternal: cfg.saveToInternal,
    libraryScanDirs: cfg.extraScanDirs,
  };
}

/** Load Rust-owned config; import legacy localStorage once if needed. */
export async function hydrateLibraryFromRust(): Promise<LibraryConfig> {
  let cfg = await invoke<LibraryConfig>("library_get_config");
  if (!cfg.legacyImportDone) {
    const legacy = readLegacyLibraryConfigPatch();
    cfg = await invoke<LibraryConfig>("library_set_config", {
      patch: { ...legacy, markLegacyImportDone: true },
    });
  }
  return cfg;
}

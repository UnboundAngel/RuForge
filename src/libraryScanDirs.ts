import { DEFAULT_OUTPUT_DIR, RUFORGE_INTERNAL_DIR } from "./store/types";

export const LS_LIBRARY_SCAN_DIRS = "ruforge-library-scan-dirs";
const LS_SCAN_DIRS_SEEDED = "ruforge-library-scan-dirs-seeded-v2";

export function normalizeScanDirKey(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function parseScanDirsJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is string => typeof d === "string" && d.trim() !== "");
  } catch {
    return [];
  }
}

/** One-time migration: legacy installs scanned `outputDir`; seed it as an extra scan root. */
function seedLibraryScanDirsFromLegacy(): string[] {
  const outputDir = localStorage.getItem("ruforge-output-dir") || DEFAULT_OUTPUT_DIR;
  const dirs: string[] = [];
  const outKey = normalizeScanDirKey(outputDir);
  const internalKey = normalizeScanDirKey(RUFORGE_INTERNAL_DIR);
  if (outputDir.trim() && outKey !== internalKey) {
    dirs.push(outputDir.trim());
  }
  localStorage.setItem(LS_LIBRARY_SCAN_DIRS, JSON.stringify(dirs));
  localStorage.setItem(LS_SCAN_DIRS_SEEDED, "1");
  return dirs;
}

export function readLibraryScanDirsFromLs(): string[] {
  if (!localStorage.getItem(LS_SCAN_DIRS_SEEDED)) {
    return seedLibraryScanDirsFromLegacy();
  }
  return parseScanDirsJson(localStorage.getItem(LS_LIBRARY_SCAN_DIRS));
}

export function writeLibraryScanDirsToLs(dirs: string[]): void {
  const unique: string[] = [];
  const seen = new Set<string>();
  const internalKey = normalizeScanDirKey(RUFORGE_INTERNAL_DIR);
  for (const d of dirs) {
    const trimmed = d.trim();
    if (!trimmed) continue;
    const key = normalizeScanDirKey(trimmed);
    if (key === internalKey) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  localStorage.setItem(LS_LIBRARY_SCAN_DIRS, JSON.stringify(unique));
  localStorage.setItem(LS_SCAN_DIRS_SEEDED, "1");
}

/** Internal vault plus user-added scan roots (deduped, non-empty). */
export function galleryScanRoots(libraryScanDirs: string[]): string[] {
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
  push(RUFORGE_INTERNAL_DIR);
  for (const d of libraryScanDirs) {
    push(d);
  }
  return roots;
}

export function isDirInLibraryScanList(dir: string, libraryScanDirs: string[]): boolean {
  const key = normalizeScanDirKey(dir);
  return galleryScanRoots(libraryScanDirs).some((r) => normalizeScanDirKey(r) === key);
}

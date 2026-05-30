export type ExportPanelPreset = {
  paths: string[];
  label?: string;
  /** Optional parent folder pre-fill (USB button); ignored when path is missing. */
  initialDestDir?: string;
};

export type ExportBundleProgressPayload = {
  phase: string;
  currentPath?: string;
  /** Human-readable step, e.g. "Video · Ep1.mp4". */
  detail?: string;
  fileIndex: number;
  fileTotal: number;
  /** Video bytes only (live during chunked copy). */
  bytesCopied: number;
  /** Sum of source video sizes. */
  bytesTotal?: number;
  percent?: number;
};

export type ExportMediaBundleResult = {
  destDir: string;
  filesCopied: number;
  filesSkipped: number;
  /** Matches progress fileTotal (planned write count). */
  filesTotal: number;
  /** filesCopied + filesSkipped; matches progress fileIndex when complete. */
  filesProcessed: number;
  bytesCopied: number;
  /** Preflight byte total; matches progress bytesTotal. */
  bytesTotal: number;
  manifestPath?: string | null;
  cancelled: boolean;
  warnings: string[];
};

export type ExportOutcome = {
  kind: "done" | "failed" | "cancelled";
  result?: ExportMediaBundleResult;
  error?: string;
};

export const LS_EXPORT_INCLUDE_MANIFEST = "ruforge-export-include-manifest";

export function readExportIncludeManifest(): boolean {
  const v = localStorage.getItem(LS_EXPORT_INCLUDE_MANIFEST);
  if (v === null) return true;
  return v !== "false";
}

export function writeExportIncludeManifest(value: boolean): void {
  localStorage.setItem(LS_EXPORT_INCLUDE_MANIFEST, value ? "true" : "false");
}

export const LS_EXPORT_LAST_DEST_DIR = "ruforge-export-last-dest-dir";

export function readExportLastDestDir(): string {
  return localStorage.getItem(LS_EXPORT_LAST_DEST_DIR)?.trim() ?? "";
}

export function writeExportLastDestDir(dir: string): void {
  const trimmed = dir.trim();
  if (trimmed) {
    localStorage.setItem(LS_EXPORT_LAST_DEST_DIR, trimmed);
  }
}

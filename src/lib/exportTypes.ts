export type ExportPanelPreset = {
  paths: string[];
  label?: string;
};

export type ExportBundleProgressPayload = {
  phase: string;
  currentPath?: string;
  fileIndex: number;
  fileTotal: number;
  bytesCopied: number;
  bytesTotal?: number;
  percent?: number;
};

export type ExportMediaBundleResult = {
  destDir: string;
  filesCopied: number;
  filesSkipped: number;
  bytesCopied: number;
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

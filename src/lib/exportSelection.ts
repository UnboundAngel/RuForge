import type { ExportPanelPreset } from "./exportTypes";
import type { GalleryEntry, MediaFile } from "../types";

export type ExportSidecarSummary = {
  hasSubs: boolean;
  hasChapters: boolean;
  hasPreviews: boolean;
};

export type ExportSelectionSummary = {
  title: string;
  fileCount: number;
  sidecars: ExportSidecarSummary;
};

export function flattenGalleryEntries(entries: GalleryEntry[]): MediaFile[] {
  const out: MediaFile[] = [];
  for (const entry of entries) {
    if (entry.kind === "playlist") {
      out.push(...entry.items);
    } else {
      out.push(entry);
    }
  }
  return out;
}

export function mediaSidecarFlags(file: MediaFile): ExportSidecarSummary {
  return {
    hasSubs: Boolean(file.subtitlePath),
    hasChapters: Boolean(file.chapters && file.chapters.length >= 2),
    hasPreviews: Boolean(file.ruforgePosterPath),
  };
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function pathUnderSelection(filePath: string, selectionPath: string): boolean {
  if (filePath === selectionPath) return true;
  const normFile = filePath.replace(/\\/g, "/");
  const normSel = selectionPath.replace(/\\/g, "/");
  return normFile.startsWith(`${normSel}/`);
}

export function resolveExportMediaPaths(
  selectionPaths: string[],
  entries: GalleryEntry[],
): string[] {
  const flat = flattenGalleryEntries(entries);
  const resolved = new Set<string>();

  for (const sel of selectionPaths) {
    const underSel = flat.filter((f) => pathUnderSelection(f.path, sel));
    if (underSel.length > 0) {
      for (const f of underSel) resolved.add(f.path);
      continue;
    }
    resolved.add(sel);
  }

  return [...resolved];
}

export function buildEntireLibraryExportPreset(
  entries: GalleryEntry[],
): ExportPanelPreset | null {
  const files = flattenGalleryEntries(entries);
  if (files.length === 0) return null;
  return {
    paths: files.map((f) => f.path),
    label: `Entire library (${files.length} files)`,
  };
}

export function summarizeExportSelection(
  paths: string[],
  entries: GalleryEntry[],
  label?: string,
): ExportSelectionSummary {
  const flat = flattenGalleryEntries(entries);
  const matched = flat.filter((f) =>
    paths.some((p) => f.path === p || f.path.startsWith(`${p}\\`) || f.path.startsWith(`${p}/`)),
  );
  const files = matched.length > 0 ? matched : paths.length === 1 ? flat.filter((f) => f.path === paths[0]) : matched;
  const sidecars: ExportSidecarSummary = {
    hasSubs: files.some((f) => mediaSidecarFlags(f).hasSubs),
    hasChapters: files.some((f) => mediaSidecarFlags(f).hasChapters),
    hasPreviews: files.some((f) => mediaSidecarFlags(f).hasPreviews),
  };

  if (label?.trim()) {
    return { title: label.trim(), fileCount: Math.max(files.length, paths.length), sidecars };
  }

  if (paths.length === 1) {
    const single = files[0];
    const title = single?.name || basename(paths[0]);
    return { title, fileCount: Math.max(files.length, 1), sidecars };
  }

  return {
    title: `${paths.length} selections`,
    fileCount: Math.max(files.length, paths.length),
    sidecars,
  };
}

export function formatExportPhaseLabel(phase: string): string {
  switch (phase) {
    case "preparing":
      return "Preparing";
    case "copying":
      return "Copying";
    case "writing_manifest":
      return "Finishing";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return phase.replace(/_/g, " ");
  }
}

export function exportProgressHeadline(
  phase: string,
  detail?: string,
): string {
  const trimmed = detail?.trim();
  if (trimmed) return trimmed;
  return formatExportPhaseLabel(phase);
}

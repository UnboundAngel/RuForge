import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { gatherExportPlaybackEntries } from "./exportPlaybackGather";
import { useRuforgeStore } from "./store/ruforgeStore";
import type { GalleryEntry, MediaFile } from "./types";

export type DevExportBundleArgs = {
  paths: string[];
  destDir: string;
  includeManifest?: boolean;
};

type ExportableSummary = {
  title: string;
  hasSubs: boolean;
  hasChapters: boolean;
  hasPreviews: boolean;
};

declare global {
  interface Window {
    __ruforgeDevExportBundle?: (args: DevExportBundleArgs) => Promise<unknown>;
    __ruforgeDevExportFirstWithSubs?: (destDir: string) => Promise<unknown>;
    __ruforgeDevListExportable?: () => ExportableSummary[];
  }
}

function flattenGalleryEntries(entries: GalleryEntry[]): MediaFile[] {
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

function mediaFlags(file: MediaFile) {
  return {
    hasSubs: Boolean(file.subtitlePath),
    hasChapters: Boolean(file.chapters && file.chapters.length >= 2),
    hasPreviews: Boolean(file.ruforgePosterPath),
  };
}

function summarizeMedia(file: MediaFile): ExportableSummary {
  const flags = mediaFlags(file);
  return {
    title: file.name || file.path.split(/[/\\]/).pop() || "(untitled)",
    ...flags,
  };
}

function pickExportCandidate(files: MediaFile[]): { file: MediaFile; reason: string } | null {
  if (files.length === 0) return null;

  const withSubsAndChapters = files.find((f) => {
    const { hasSubs, hasChapters } = mediaFlags(f);
    return hasSubs && hasChapters;
  });
  if (withSubsAndChapters) {
    return {
      file: withSubsAndChapters,
      reason: "first with subtitles and chapters",
    };
  }

  const withSubs = files.find((f) => mediaFlags(f).hasSubs);
  if (withSubs) {
    return {
      file: withSubs,
      reason: "first with subtitles (no entry had both subs and chapters)",
    };
  }

  return {
    file: files[0],
    reason: "first media entry (none have subtitles)",
  };
}

function requireMainWindow(): boolean {
  if (getCurrentWindow().label !== "main") {
    console.warn("RuForge dev export: use the main window.");
    return false;
  }
  return true;
}

async function invokeExportBundle(
  paths: string[],
  destDir: string,
  includeManifest = true,
) {
  const playbackEntries = gatherExportPlaybackEntries(paths);
  return invoke("export_media_bundle", {
    options: {
      paths,
      destDir,
      includeManifest,
      playbackEntries,
    },
  });
}

export function installDevExportBundleTest(): void {
  if (!import.meta.env.DEV) return;

  window.__ruforgeDevExportBundle = async ({
    paths,
    destDir,
    includeManifest = true,
  }: DevExportBundleArgs) => {
    if (!requireMainWindow()) return;

    const result = await invokeExportBundle(paths, destDir, includeManifest);
    console.log("export_media_bundle:", result);
    return result;
  };

  window.__ruforgeDevListExportable = () => {
    if (!requireMainWindow()) return [];

    const files = flattenGalleryEntries(useRuforgeStore.getState().entries);
    const list = files.map(summarizeMedia);
    console.table(list);
    return list;
  };

  window.__ruforgeDevExportFirstWithSubs = async (destDir: string) => {
    if (!requireMainWindow()) return;

    const files = flattenGalleryEntries(useRuforgeStore.getState().entries);
    const picked = pickExportCandidate(files);
    if (!picked) {
      console.warn("__ruforgeDevExportFirstWithSubs: library is empty. Scan first.");
      return;
    }

    const flags = mediaFlags(picked.file);
    const title = picked.file.name || picked.file.path.split(/[/\\]/).pop();
    console.log(
      `Export pick: "${title}" (${picked.reason}); subs=${flags.hasSubs} chapters=${flags.hasChapters} previews=${flags.hasPreviews}`,
    );

    const result = await invokeExportBundle([picked.file.path], destDir, true);
    console.log("export_media_bundle result:", result);
    return result;
  };

  console.log(
    "Export dev: __ruforgeDevListExportable() | __ruforgeDevExportFirstWithSubs(destDir) | __ruforgeDevExportBundle({ paths, destDir })",
  );
}

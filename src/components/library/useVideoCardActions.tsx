import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GalleryEntry, MediaFile, PlaylistCollection } from "@/types";
import { deleteLibraryMedia } from "@/deleteLibraryMedia";
import { filterMainLibraryEntries } from "@/mainLibraryFilter";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { WATCH_LATER_ID, virtualPlaylistPath } from "@/virtualPlaylists";
import type { MenuAt } from "../music/musicMenuUi";
import { SaveToPlaylistPopover } from "./SaveToPlaylistPopover";

/** Path form the library compares on, since scans and playlists can disagree on slashes and case. */
export function libraryPathKey(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

/**
 * Every library video once: loose files first, then playlist items the loose list does not already
 * hold. Tags are keyed per video, so a tagged video inside a playlist still belongs on its tag page.
 */
export function useTaggableFiles(): MediaFile[] {
  const entries = useRuforgeStore((s) => s.entries);
  const hideAudio = useRuforgeStore((s) => s.settings.hideAudioFromMainLibrary !== false);
  return useMemo(() => {
    const visible = filterMainLibraryEntries(entries, hideAudio);
    const loose = visible.filter((e): e is GalleryEntry & { kind: "media" } => e.kind === "media");
    const inPlaylists = visible
      .filter((e): e is PlaylistCollection => e.kind === "playlist")
      .flatMap((p) => p.items);
    const seen = new Set<string>();
    const out: MediaFile[] = [];
    for (const file of [...loose, ...inPlaylists]) {
      const key = libraryPathKey(file.path);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(file);
    }
    return out;
  }, [entries, hideAudio]);
}

/** The card menu actions a library grid owns, shared by the Library and the game pages. */
export function useVideoCardActions() {
  const notify = useRuforgeStore((s) => s.notify);
  const entries = useRuforgeStore((s) => s.entries);
  const setGalleryActiveMenu = useRuforgeStore((s) => s.setGalleryActiveMenu);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const addGalleryExtractingPath = useRuforgeStore((s) => s.addGalleryExtractingPath);
  const removeGalleryExtractingPath = useRuforgeStore((s) => s.removeGalleryExtractingPath);
  const toggleWatchLater = useRuforgeStore((s) => s.toggleWatchLater);
  const [save, setSave] = useState<{ paths: string[]; at: MenuAt } | null>(null);
  const lastSave = useRef<{ paths: string[] }>({ paths: [] });

  const onDelete = useCallback(
    async (file: MediaFile) => {
      setGalleryActiveMenu(null);
      await deleteLibraryMedia(file);
      setGalleryActiveMenu(null);
    },
    [setGalleryActiveMenu],
  );

  const onExtract = useCallback(
    async (file: MediaFile) => {
      addGalleryExtractingPath(file.path);
      try {
        await invoke("extract_frames", { videoPath: file.path, allowGenerate: true });
        notify("Previews generated successfully.");
        await fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true, skipScrubBackfill: true });
      } catch (e) {
        console.error(e);
        notify("Failed to generate previews.");
      } finally {
        removeGalleryExtractingPath(file.path);
        setGalleryActiveMenu(null);
      }
    },
    [addGalleryExtractingPath, fetchEntries, notify, removeGalleryExtractingPath, setGalleryActiveMenu],
  );

  const onToggleWatchLater = useCallback(
    (file: MediaFile) => {
      const added = toggleWatchLater(file.path);
      notify(added ? "Saved to Watch later" : "Removed from Watch later");
      setGalleryActiveMenu(null);
    },
    [notify, setGalleryActiveMenu, toggleWatchLater],
  );

  const openSavePopover = useCallback((paths: string[], at: MenuAt) => {
    lastSave.current = { paths };
    setSave({ paths, at });
  }, []);

  const onSaveToPlaylist = useCallback(
    (file: MediaFile, at: MenuAt) => {
      setGalleryActiveMenu(null);
      openSavePopover([file.path], at);
    },
    [openSavePopover, setGalleryActiveMenu],
  );

  const watchLaterPaths = useMemo(() => {
    const wl = entries.find(
      (e): e is PlaylistCollection => e.kind === "playlist" && e.path === virtualPlaylistPath(WATCH_LATER_ID),
    );
    return new Set((wl?.items ?? []).map((i) => libraryPathKey(i.path)));
  }, [entries]);

  // Paths stay mounted through the close so the popover keeps its rows while it hides.
  const saveModal = (
    <SaveToPlaylistPopover
      paths={save?.paths ?? lastSave.current.paths}
      at={save?.at ?? null}
      onClose={() => setSave(null)}
    />
  );

  return {
    onDelete,
    onExtract,
    onToggleWatchLater,
    onSaveToPlaylist,
    watchLaterPaths,
    openSavePopover,
    saveModal,
  };
}

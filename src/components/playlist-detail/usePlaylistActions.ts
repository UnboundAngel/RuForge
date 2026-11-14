import { useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { PlaylistCollection } from "@/types";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { deleteLibraryMedia } from "@/deleteLibraryMedia";
import { askConfirm } from "@/components/ConfirmDialog";
import { findMovedVideo } from "@/lib/playlistSession/videoIdentities";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { noteOnboardingEvent } from "@/lib/onboardingConditions";
import { isDemoPlaylistPath } from "@/lib/demoPlaylistPath";
import { reorderDemoPlaylist } from "@/lib/useOnboardingMockPlaylists";
import {
  fileNameOf,
  isLinkedToDiskPlaylist,
  linkToDiskPlaylist,
  orderFromFiles,
  saveDiskPlaylistMeta,
  unlinkFromDiskPlaylist,
} from "@/lib/diskPlaylistMeta";
import { insertRecordItem, relocateRecordItem } from "@/lib/playlistRecordOps";
import { markPlaylistItemsWatched, setPlaylistStartVideo } from "@/lib/playlistSession";
import {
  getVirtualRecord,
  loadVirtualPlaylistRecords,
  parseVirtualPlaylistId,
  saveVirtualPlaylistRecords,
} from "@/virtualPlaylists";
import { moveInList, rowTitle, type FileRow, type MissingRow, type PlaylistRowModel } from "./playlistRows";

const pathKey = (p: string) => p.replace(/\//g, "\\").toLowerCase();
const VIDEO_EXTENSIONS = ["mp4", "mkv", "webm", "mov", "avi", "m4v", "flv", "wmv", "ts"];

/** Everything the detail screen changes in a playlist, for video playlists and folder playlists alike. */
export function usePlaylistActions(playlist: PlaylistCollection, rows: PlaylistRowModel[]) {
  const store = useRuforgeStore;
  const recordId = parseVirtualPlaylistId(playlist.path);
  const sessionId = playlist.path;

  const fileRows = useMemo(() => rows.filter((r): r is FileRow => r.type === "file"), [rows]);

  const refresh = useCallback(() => store.getState().refreshVirtualPlaylists(), [store]);

  const saveDiskOrder = useCallback(
    (files: FileRow[]) => {
      void saveDiskPlaylistMeta(playlist.path, { order: orderFromFiles(files.map((r) => r.file)) }).then(refresh);
      refresh();
    },
    [playlist.path, refresh],
  );

  /** Moves the row at `from` to the slot of the row at `to`, both positions in playlist order. */
  const reorder = useCallback(
    (fromKey: string, toKey: string) => {
      if (fromKey === toKey) return;
      noteOnboardingEvent("video-playlist-reordered");
      if (isDemoPlaylistPath(playlist.path)) {
        reorderDemoPlaylist(fromKey, toKey);
        return;
      }
      if (recordId) {
        const from = rows.find((r) => r.key === fromKey);
        const to = rows.find((r) => r.key === toKey);
        if (!from || !to) return;
        const fromPath = from.type === "file" ? from.file.path : from.path;
        const toPath = to.type === "file" ? to.file.path : to.path;
        store.getState().reorderVirtualPlaylistByPath(recordId, fromPath, toPath);
        return;
      }
      const from = fileRows.findIndex((r) => r.key === fromKey);
      const to = fileRows.findIndex((r) => r.key === toKey);
      if (from < 0 || to < 0) return;
      saveDiskOrder(moveInList(fileRows, from, to));
    },
    [fileRows, playlist.path, recordId, rows, saveDiskOrder, store],
  );

  const moveTo = useCallback(
    (row: FileRow, where: "top" | "bottom") => {
      if (recordId) {
        store.getState().moveVirtualPlaylistItem(recordId, row.file.path, where);
        return;
      }
      const from = fileRows.findIndex((r) => r.key === row.key);
      if (from < 0) return;
      saveDiskOrder(moveInList(fileRows, from, where === "top" ? 0 : fileRows.length - 1));
    },
    [fileRows, recordId, saveDiskOrder, store],
  );

  /** Removes without asking and offers Undo, which puts the item back in its old slot. */
  const remove = useCallback(
    (row: PlaylistRowModel) => {
      const { notify } = store.getState();
      const path = row.type === "file" ? row.file.path : row.path;
      if (!recordId) {
        if (row.type !== "file") return;
        // A linked video only leaves the playlist; its file belongs somewhere else.
        if (!isLinkedToDiskPlaylist(playlist.path, path)) return void deleteLibraryMedia(row.file);
        void unlinkFromDiskPlaylist(playlist.path, [path]).then(refresh);
        notify(`Removed ${rowTitle(row.file.name)}`, "info", {
          label: "Undo",
          run: () => void linkToDiskPlaylist(playlist.path, [path]).then(refresh),
        });
        return;
      }
      const record = getVirtualRecord(recordId);
      const index = record?.items.findIndex((i) => mediaPathsMatch(i.path, path)) ?? -1;
      const snapshot = index >= 0 ? record?.items[index] : undefined;
      store.getState().removeFromVirtualPlaylist(recordId, path);
      const name = row.type === "file" ? rowTitle(row.file.name) : row.name;
      notify(
        `Removed ${name}`,
        "info",
        snapshot
          ? {
              label: "Undo",
              run: () => {
                const records = loadVirtualPlaylistRecords();
                saveVirtualPlaylistRecords(
                  records.map((r) => (r.id === recordId ? insertRecordItem(r, snapshot, index) : r)),
                );
                refresh();
              },
            }
          : undefined,
      );
    },
    [playlist.path, recordId, refresh, store],
  );

  const relocate = useCallback(
    async (row: MissingRow) => {
      if (!recordId) return;
      // A moved or renamed download is found by its video id before asking for a file.
      const library = store
        .getState()
        .entries.flatMap((e) => (e.kind === "media" ? [e] : e.items));
      const taken = new Set(rows.flatMap((r) => (r.type === "file" ? [pathKey(r.file.path)] : [])));
      const moved = findMovedVideo(row.identityKey, library, taken);
      let picked: string | null = null;
      if (moved) {
        const useIt = await askConfirm({
          title: "Found it",
          message: `${rowTitle(moved.name)} is in your library at a new location. Use it for this item?`,
          confirmLabel: "Use it",
          cancelLabel: "Pick another file",
          tone: "accent",
          theme: "app",
        });
        if (useIt) picked = moved.path;
      }
      if (!picked) {
        const chosen = await open({
          multiple: false,
          title: `Find ${row.name}`,
          filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
        });
        if (typeof chosen !== "string") return;
        picked = chosen;
      }
      const records = loadVirtualPlaylistRecords();
      saveVirtualPlaylistRecords(
        records.map((r) => (r.id === recordId ? relocateRecordItem(r, row.path, picked) : r)),
      );
      refresh();
      const inLibrary = store
        .getState()
        .entries.some((e) =>
          e.kind === "media" ? mediaPathsMatch(e.path, picked) : e.items.some((f) => mediaPathsMatch(f.path, picked)),
        );
      if (!inLibrary) {
        store
          .getState()
          .notify(`${fileNameOf(picked)} is outside your library folders, so it still shows as missing.`, "warning");
      }
    },
    [recordId, refresh, rows, store],
  );

  const setWatched = useCallback(
    (keys: string[], watched: boolean) => markPlaylistItemsWatched(sessionId, keys, watched),
    [sessionId],
  );

  const setStart = useCallback(
    (key: string | null) => setPlaylistStartVideo(sessionId, key),
    [sessionId],
  );

  const saveDetails = useCallback(
    (title: string, description: string) => {
      const next = title.trim();
      if (recordId) {
        store.getState().updateVirtualPlaylistDetails(recordId, { title: next || playlist.title, description });
        return;
      }
      void saveDiskPlaylistMeta(playlist.path, {
        title: next && next !== playlist.title ? next : undefined,
        description: description.trim() || undefined,
      }).then(refresh);
      refresh();
    },
    [playlist.path, playlist.title, recordId, refresh, store],
  );

  return { recordId, reorder, moveTo, remove, relocate, setWatched, setStart, saveDetails };
}

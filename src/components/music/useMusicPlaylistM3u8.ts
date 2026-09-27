import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useRuforgeStore } from "@/store/ruforgeStore";
import type { MediaFile } from "@/types";
import {
  importSummary,
  matchM3u8Entries,
  parseM3u8,
  playlistNameFromPath,
  serializeM3u8,
} from "./musicPlaylistM3u8";
import { showMusicToast } from "./musicToast";
import { useMusicLibraryTracks } from "./useMusicPlaylists";

const M3U_FILTERS = [{ name: "Playlist", extensions: ["m3u8", "m3u"] }];

function safeFileName(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "Playlist";
}

export function useExportPlaylistM3u8() {
  return useCallback(async (title: string, tracks: MediaFile[]) => {
    const target = await save({ defaultPath: `${safeFileName(title)}.m3u8`, filters: M3U_FILTERS });
    if (!target) return;
    const path = /\.m3u8?$/i.test(target) ? target : `${target}.m3u8`;
    try {
      await invoke("write_playlist_text_file", { path, contents: serializeM3u8(tracks, title) });
      showMusicToast(`Exported ${title}`);
    } catch (e) {
      showMusicToast(`Could not export: ${String(e)}`, "error");
    }
  }, []);
}

export function useImportPlaylistM3u8() {
  const createMusicPlaylist = useRuforgeStore((s) => s.createMusicPlaylist);
  const openMusicPlaylist = useRuforgeStore((s) => s.openMusicPlaylist);
  const library = useMusicLibraryTracks();
  return useCallback(async () => {
    const picked = await open({ multiple: false, directory: false, filters: M3U_FILTERS });
    const path = typeof picked === "string" ? picked : null;
    if (!path) return;
    let text: string;
    try {
      text = await invoke<string>("read_playlist_text_file", { path });
    } catch (e) {
      showMusicToast(`Could not read playlist: ${String(e)}`, "error");
      return;
    }
    const parsed = parseM3u8(text, path);
    if (parsed.entries.length === 0) {
      showMusicToast("That file has no songs in it", "warning");
      return;
    }
    const { paths, unmatched } = matchM3u8Entries(parsed.entries, library);
    const title = parsed.name ?? playlistNameFromPath(path);
    openMusicPlaylist(createMusicPlaylist(paths, title));
    showMusicToast(importSummary(title, paths.length, unmatched), unmatched > 0 ? "warning" : "info");
  }, [createMusicPlaylist, openMusicPlaylist, library]);
}

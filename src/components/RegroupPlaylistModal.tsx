import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layers } from "lucide-react";
import { fetchVideoInfoWithTimeout } from "../downloadVideoInfoFetch";
import { cookieContextFromSettings } from "../downloadQueue";
import { formatApproxFileSize } from "./downloader/downloaderFormat";
import {
  findLibraryMatchForPlaylistItem,
  isFlatMediaAtGalleryRoot,
} from "../duplicateDownload";
import { useRuforgeStore, RUFORGE_INTERNAL_DIR } from "../store/ruforgeStore";
import { extractYouTubeVideoId, sanitizePlaylistFolderName } from "../youtubeUrl";
import type { GalleryEntry, PlaylistItem, VideoInfo } from "../types";
import {
  SettingsModalBtnGhost,
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalShell,
  SettingsModalSurface,
  SettingsModalTextInput,
} from "./settings/SettingsModalShell";

type RegroupRow = {
  index: number;
  title: string;
  sourceId: string | null;
  matchedPath: string | null;
  matchedSize: number | null;
  inLibrary: boolean;
  flatAtRoot: boolean;
};

type RegroupResult = {
  moved: number;
  skipped: number;
  notFound: number;
  folderPath: string;
};

function resolveSourceIdForRegroup(
  item: PlaylistItem,
  matchedPath: string | null,
  entries: GalleryEntry[],
): string | null {
  const fromItem = item.id?.trim();
  if (fromItem) return fromItem;
  if (!matchedPath) return null;
  for (const entry of entries) {
    const files =
      entry.kind === "media" ? [entry] : entry.kind === "playlist" ? entry.items : [];
    for (const f of files) {
      if (f.path !== matchedPath) continue;
      const sid = f.sourceId?.trim();
      if (sid) return sid;
      const fromUrl = f.sourceUrl?.trim();
      if (fromUrl) {
        const vid = extractYouTubeVideoId(fromUrl);
        if (vid) return vid;
      }
    }
  }
  return null;
}

export function RegroupPlaylistModal({
  open,
  onClose,
  customOutputDir,
}: {
  open: boolean;
  onClose: () => void;
  customOutputDir: string;
}) {
  const settings = useRuforgeStore((s) => s.settings);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const notify = useRuforgeStore((s) => s.notify);

  const searchRoots = [RUFORGE_INTERNAL_DIR, customOutputDir].filter(
    (d, i, arr) => d.trim() !== "" && arr.indexOf(d) === i,
  );

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [rows, setRows] = useState<RegroupRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) {
      setError("Enter a valid YouTube playlist URL.");
      return;
    }
    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setRows([]);
    try {
      await fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true });
      const entries = useRuforgeStore.getState().entries;

      const info = await fetchVideoInfoWithTimeout(
        trimmed,
        "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        false,
        cookieContextFromSettings(settings),
      );
      if (!info.isPlaylist || !info.playlistItems?.length) {
        setError("URL is not a playlist with videos.");
        return;
      }
      const built: RegroupRow[] = info.playlistItems.map((item: PlaylistItem, i: number) => {
        const match = findLibraryMatchForPlaylistItem(item, entries);
        const file = match?.file;
        const flatAtRoot =
          Boolean(file) &&
          searchRoots.some((root) => isFlatMediaAtGalleryRoot(file!, root));
        return {
          index: i + 1,
          title: item.title,
          sourceId: resolveSourceIdForRegroup(item, file?.path ?? null, entries),
          matchedPath: file?.path ?? null,
          matchedSize: file?.size ?? null,
          inLibrary: Boolean(file),
          flatAtRoot,
        };
      });
      setVideoInfo(info);
      setRows(built);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [url, settings, fetchEntries, searchRoots]);

  const handleGroup = useCallback(async () => {
    if (!videoInfo?.playlistItems?.length) return;
    const movable = rows.filter((r) => r.matchedPath && r.sourceId && r.flatAtRoot);
    if (movable.length === 0) {
      notify(
        "No flat files at the download root matched. Files already in a subfolder are skipped.",
        "warning",
      );
      return;
    }
    setGrouping(true);
    setError(null);
    try {
      const result = await invoke<RegroupResult>("regroup_playlist_downloads", {
        searchRoots,
        folderTitle: sanitizePlaylistFolderName(videoInfo.title),
        items: movable.map((r) => ({
          index: r.index,
          sourceId: r.sourceId,
          title: r.title,
        })),
      });
      await fetchEntries({ manageLoadingStart: true });
      notify(
        `Grouped ${result.moved} file(s) into playlist folder. ${result.notFound} not found, ${result.skipped} skipped.`,
        "info",
      );
      if (result.moved > 0) onClose();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setGrouping(false);
    }
  }, [videoInfo, rows, searchRoots, fetchEntries, notify, onClose]);

  const matchCount = rows.filter((r) => r.flatAtRoot && r.matchedPath && r.sourceId).length;

  return (
    <SettingsModalShell
      open={open}
      onClose={onClose}
      titleId="regroup-playlist-title"
      title="Group playlist downloads"
      icon={Layers}
      description="Moves videos stored flat at the download root into a numbered playlist subfolder. Paste the playlist URL used when downloading. Scans the internal vault and your custom download path."
      zIndexClass="z-[200]"
      disableDismiss={loading || grouping}
      footer={
        <>
          <SettingsModalBtnSecondary onClick={onClose}>Cancel</SettingsModalBtnSecondary>
          <SettingsModalBtnPrimary
            disabled={grouping || matchCount === 0}
            onClick={() => void handleGroup()}
          >
            {grouping ? "Grouping…" : `Group ${matchCount} file${matchCount === 1 ? "" : "s"}`}
          </SettingsModalBtnPrimary>
        </>
      }
    >
      <div className="space-y-4">
        <SettingsModalTextInput
          value={url}
          onChange={setUrl}
          placeholder="https://www.youtube.com/playlist?list=..."
          disabled={loading || grouping}
        />
        <SettingsModalBtnGhost
          disabled={loading}
          onClick={() => void loadPreview()}
          className="w-full"
        >
          {loading ? "Loading…" : "Preview matches"}
        </SettingsModalBtnGhost>
        {error ? (
          <p className="text-[12px] leading-relaxed text-red-400/90" role="alert">
            {error}
          </p>
        ) : null}
        {videoInfo && rows.length > 0 ? (
          <SettingsModalSurface className="max-h-52 overflow-y-auto rf-scrollbar space-y-2">
            {rows.map((r) => (
              <div
                key={`${r.index}-${r.title}`}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <span className="min-w-0 truncate font-medium text-stone-300">
                  {r.index}. {r.title}
                </span>
                <span className="shrink-0 text-stone-500">
                  {!r.inLibrary
                    ? "Not in library"
                    : !r.flatAtRoot
                      ? "In subfolder"
                      : r.matchedSize
                        ? `~${formatApproxFileSize(r.matchedSize)}`
                        : "Matched"}
                </span>
              </div>
            ))}
          </SettingsModalSurface>
        ) : null}
      </div>
    </SettingsModalShell>
  );
}

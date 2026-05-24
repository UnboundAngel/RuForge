import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Layers } from "lucide-react";
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
      setError("Paste a YouTube playlist URL.");
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
        setError("That URL is not a playlist with videos.");
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

  if (!open) return null;

  const matchCount = rows.filter((r) => r.flatAtRoot && r.matchedPath && r.sourceId).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="regroup-playlist-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1D1613] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[color:var(--accent)]" />
            <h2
              id="regroup-playlist-title"
              className="text-sm font-black uppercase tracking-[0.2em] text-white"
            >
              Group playlist files
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-500 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-[10px] leading-relaxed text-stone-500">
            Moves videos already in your download folder (flat at the root) into a
            playlist subfolder with numbered names. Paste the same playlist URL you
            used when downloading. Scans internal vault and your custom download path.
          </p>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/playlist?list=..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-stone-200 outline-none focus:border-[color:var(--accent)]/40"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadPreview()}
            className="w-full rounded-xl bg-white/5 py-2.5 text-[10px] font-black uppercase tracking-[0.3em] text-stone-300 hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Preview matches"}
          </button>
          {error && (
            <p className="text-[10px] text-red-400/90">{error}</p>
          )}
          {videoInfo && rows.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-left">
              {rows.map((r) => (
                <li
                  key={`${r.index}-${r.title}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[10px] text-stone-400"
                >
                  <span className="min-w-0 truncate font-bold uppercase tracking-wide text-stone-500">
                    {r.index}. {r.title}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-right">
                    {!r.inLibrary
                      ? "not in library"
                      : !r.flatAtRoot
                        ? "in subfolder"
                        : r.matchedSize
                          ? `~${formatApproxFileSize(r.matchedSize)}`
                          : "matched"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 border-t border-white/5 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 py-2.5 text-[10px] font-black uppercase tracking-[0.25em] text-stone-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={grouping || matchCount === 0}
            onClick={() => void handleGroup()}
            className="flex-1 rounded-xl bg-[color:var(--accent)] py-2.5 text-[10px] font-black uppercase tracking-[0.25em] text-stone-950 disabled:opacity-40"
          >
            {grouping ? "Grouping…" : `Group ${matchCount} file(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Download, ListMusic, RefreshCw, Link2, Copy, X, ArrowRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  buildDownloadJobOptions,
  patchDownloadJobOptionsForAudio,
  resolveDownloadOutputDir,
} from "@/downloadQueue";
import {
  sanitizePlaylistFolderName,
  isMusicYouTubePlaylistUrl,
  isMusicYouTubeUrl,
  canonicalMusicYouTubeUrl,
  resolveMusicExplorePasteUrl,
  isMusicExplorePasteUrl,
} from "@/youtubeUrl";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { playlistFolderTitle, type MusicPlaylistPage } from "@/lib/musicExploreTracks";

type StripMode = "playlist" | "artist" | "other";

function getStripMode(url: string): StripMode {
  if (!url) return "other";
  if (isMusicYouTubePlaylistUrl(url)) return "playlist";
  if (isMusicYouTubeUrl(url)) return "artist";
  return "other";
}

type Props = {
  shellBlack?: boolean;
  currentUrl: string;
  pasteMode: boolean;
  onPickTracks: () => void;
  onActivatePaste: () => void;
  onDeactivatePaste: () => void;
  onPasteUrlReady: (url: string) => void;
  onReload: () => void;
};

export function MusicExploreBottomBar({
  shellBlack = false,
  currentUrl,
  pasteMode,
  onPickTracks,
  onActivatePaste,
  onDeactivatePaste,
  onPasteUrlReady,
  onReload,
}: Props) {
  const mode = getStripMode(currentUrl);

  const settings = useRuforgeStore((s) => s.settings);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const releaseHeldDownloadJobs = useRuforgeStore((s) => s.releaseHeldDownloadJobs);
  const pumpDownloadQueue = useRuforgeStore((s) => s.pumpDownloadQueue);
  const queueActive = useRuforgeStore((s) =>
    s.downloadJobs.filter(
      (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
    ).length,
  );

  const [pasteInputValue, setPasteInputValue] = useState("");
  const [pasteChecking, setPasteChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pasteMode) {
      setPasteInputValue("");
      setPasteChecking(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (cancelled) return;
        const resolved = resolveMusicExplorePasteUrl(text.trim());
        if (resolved) {
          setPasteInputValue(resolved);
          setPasteChecking(false);
          return;
        }
      } catch {
        /* clipboard denied */
      }
      if (!cancelled) {
        inputRef.current?.focus();
      }
    };
    void run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteMode]);

  const submitPasteUrl = () => {
    const resolved = resolveMusicExplorePasteUrl(pasteInputValue.trim());
    if (!resolved) return;
    onPasteUrlReady(resolved);
    setPasteInputValue("");
  };

  const downloadAll = async () => {
    const canonical = canonicalMusicYouTubeUrl(currentUrl);
    if (!canonical) return;
    const dir = resolveDownloadOutputDir(saveToInternal, outputDir);
    const base = buildDownloadJobOptions(settings, dir);
    const opts = patchDownloadJobOptionsForAudio(base, true, settings);

    try {
      let offset = 0;
      let hasMore = true;
      let folderName: string | undefined;
      while (hasMore) {
        const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
          url: canonical,
          offset,
          limit: 50,
        });
        if (!folderName) {
          folderName = sanitizePlaylistFolderName(playlistFolderTitle(page.title, canonical));
        }
        for (let i = 0; i < page.items.length; i++) {
          const track = page.items[i];
          enqueueDownload(
            track.url,
            { ...opts, playlistOutputFolder: folderName, playlistIndex: offset + i + 1 },
            { title: track.title, approval: "held" },
          );
        }
        hasMore = page.hasMore;
        offset += page.items.length;
        if (!page.hasMore || page.items.length === 0) break;
      }
      releaseHeldDownloadJobs();
      pumpDownloadQueue();
    } catch (e) {
      console.warn("[MusicExploreBottomBar] download all error:", e);
    }
  };

  const copyUrl = async () => {
    if (!currentUrl) return;
    try { await navigator.clipboard.writeText(currentUrl); } catch { /* ok */ }
  };

  const btn =
    "h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/8 shrink-0 select-none";

  return (
    <div
      className="flex w-full min-w-0 items-center gap-0.5 px-2 overflow-x-auto shrink-0"
      style={{
        height: "var(--music-explore-bar-height)",
        color: "var(--music-text-secondary)",
        background: shellBlack ? "var(--music-bg)" : "var(--music-surface)",
        borderBottomRightRadius: "var(--music-panel-radius)",
      }}
    >
      <AnimatePresence mode="wait">
        {pasteMode ? (
          <motion.div
            key="paste-input"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex flex-1 min-w-0 items-center gap-2"
          >
            <button
              type="button"
              onClick={onDeactivatePaste}
              title="Cancel"
              className={cn(btn, "gap-1")}
            >
              <X size={14} />
              <span>Cancel</span>
            </button>

            <form
              className="flex flex-1 min-w-0 items-center gap-1.5"
              onSubmit={(e) => { e.preventDefault(); submitPasteUrl(); }}
            >
              <div
                className="relative flex-1 min-w-0 flex items-center"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {pasteChecking ? (
                  <Loader2
                    size={13}
                    className="absolute left-2.5 shrink-0 animate-spin"
                    style={{ color: "var(--music-accent)" }}
                  />
                ) : (
                  <Link2
                    size={13}
                    className="absolute left-2.5 shrink-0"
                    style={{ color: "var(--music-accent)" }}
                  />
                )}
                <input
                  ref={inputRef}
                  type="url"
                  value={pasteInputValue}
                  onChange={(e) => setPasteInputValue(e.target.value)}
                  placeholder="music.youtube.com URL"
                  className="w-full bg-transparent text-xs outline-none pl-8 pr-2 py-1.5 truncate"
                  style={{ color: "var(--music-text-primary)" }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="submit"
                disabled={!isMusicExplorePasteUrl(pasteInputValue.trim())}
                className={cn(
                  btn,
                  "disabled:opacity-40 disabled:cursor-default",
                )}
                style={{ color: "var(--music-accent)" }}
              >
                <ArrowRight size={15} />
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="normal-buttons"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex flex-1 min-w-0 items-center gap-0.5"
          >
            {mode === "playlist" && (
              <>
                <button
                  type="button"
                  onClick={() => void downloadAll()}
                  title="Download all"
                  className={btn}
                  style={{ color: "var(--music-text-primary)" }}
                >
                  <Download size={15} style={{ color: "var(--music-accent)" }} />
                  <span>Download all{queueActive > 0 ? ` (${queueActive})` : ""}</span>
                </button>
                <button
                  type="button"
                  onClick={onPickTracks}
                  title="Pick tracks"
                  className={btn}
                >
                  <ListMusic size={15} />
                  <span>Pick tracks</span>
                </button>
              </>
            )}

            {mode === "artist" && (
              <button
                type="button"
                onClick={onPickTracks}
                title="Browse playlists"
                className={btn}
              >
                <ListMusic size={15} />
                <span>Browse playlists</span>
              </button>
            )}

            <button
              type="button"
              onClick={onActivatePaste}
              title="Paste link"
              className={btn}
            >
              <Link2 size={15} />
              <span>Paste link</span>
            </button>

            <button
              type="button"
              onClick={onReload}
              title="Reload page"
              className={btn}
            >
              <RefreshCw size={15} />
              <span>Reload</span>
            </button>

            {currentUrl && (
              <button
                type="button"
                onClick={() => void copyUrl()}
                title="Copy page URL"
                className={cn(btn, "ml-auto")}
              >
                <Copy size={15} />
                <span>Copy URL</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

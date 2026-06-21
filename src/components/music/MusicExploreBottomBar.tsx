import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ListMusic, RefreshCw, Link2, Copy, X, ArrowRight, Loader2, CloudDownload, Check, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRuforgeStore } from "@/store/ruforgeStore";
import {
  buildDownloadJobOptions,
  patchDownloadJobOptionsForAudio,
  resolveDownloadOutputDir,
} from "@/downloadQueue";
import {
  sanitizePlaylistFolderName,
  canonicalMusicYouTubeUrl,
  resolveMusicExplorePasteUrl,
  isMusicExplorePasteUrl,
  isMusicYouTubePlaylistUrl,
  extractYouTubePlaylistId,
} from "@/youtubeUrl";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { playlistFolderTitle, type MusicPlaylistPage } from "@/lib/musicExploreTracks";
import {
  MUSIC_EXPLORE_MAX_PLAYLIST_PAGES_PER_ACTION,
  throttleMusicExplorePageFetch,
} from "@/lib/ytdlpPageFetchThrottle";
import {
  harvestedTracklistAppliesToUrl,
  isHarvestTracklistComplete,
  harvestedTracklistToPlaylistPage,
} from "@/lib/musicExploreTracklistHarvest";
import type { MusicExplorePageContext } from "@/lib/musicExplorePageContext";
import { debugLog } from "@/debug/debugLog";

type Props = {
  shellBlack?: boolean;
  currentUrl: string;
  pageContext: MusicExplorePageContext;
  pasteMode: boolean;
  onPickTracks: () => void;
  onActivatePaste: () => void;
  onDeactivatePaste: () => void;
  onPasteUrlReady: (url: string) => void;
  onReload: () => void;
};

function pageKindLabel(kind: MusicExplorePageContext["kind"]): string {
  switch (kind) {
    case "home": return "Home";
    case "search": return "Search";
    case "library": return "Library";
    case "playlist": return "Playlist";
    case "watch": return "Song";
    case "browse": return "Browse";
    case "artist": return "Artist";
    case "album": return "Album";
    case "channel": return "Channel";
    default: return "Explore";
  }
}

// ---------------------------------------------------------------------------
// Ripple button
// ---------------------------------------------------------------------------

type RippleDot = { id: number; x: number; y: number; r: number };

function RippleBtn({
  className,
  style,
  children,
  onMouseDown,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [ripples, setRipples] = useState<RippleDot[]>([]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const r = Math.hypot(rect.width, rect.height);
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = performance.now() + Math.random();
      setRipples((prev) => [...prev, { id, x, y, r }]);
      setTimeout(() => setRipples((prev) => prev.filter((rp) => rp.id !== id)), 780);
      (onMouseDown as React.MouseEventHandler<HTMLButtonElement> | undefined)?.(e);
    },
    [onMouseDown],
  );

  return (
    <button
      className={cn("relative overflow-hidden", className)}
      style={style}
      onMouseDown={handleMouseDown}
      {...rest}
    >
      {/* Ripple layers — rendered first so content paints above via relative z-10 */}
      {ripples.map((rp) => (
        <motion.span
          key={rp.id}
          aria-hidden
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 0.92, 1.18], opacity: [0.48, 0.34, 0] }}
          transition={{
            duration: 0.72,
            ease: [0.22, 1, 0.36, 1],
            times: [0, 0.32, 1],
          }}
          style={{
            position: "absolute",
            left: rp.x - rp.r,
            top: rp.y - rp.r,
            width: rp.r * 2,
            height: rp.r * 2,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.32)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
            pointerEvents: "none",
            zIndex: 0,
            willChange: "transform, opacity",
          }}
        />
      ))}
      <span className="relative z-10 flex items-center gap-1.5">
        {children}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MusicExploreBottomBar({
  shellBlack = false,
  currentUrl,
  pageContext,
  pasteMode,
  onPickTracks,
  onActivatePaste,
  onDeactivatePaste,
  onPasteUrlReady,
  onReload,
}: Props) {
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const releaseHeldDownloadJobs = useRuforgeStore((s) => s.releaseHeldDownloadJobs);
  const pumpDownloadQueue = useRuforgeStore((s) => s.pumpDownloadQueue);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const queueActive = downloadJobs.filter(
    (j) => j.status === "queued" || j.status === "downloading" || j.status === "paused",
  ).length;

  const [pasteInputValue, setPasteInputValue] = useState("");
  const [pasteChecking, setPasteChecking] = useState(false);
  const [downloadingPlaylist, setDownloadingPlaylist] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track which playlist URLs were queued this session + folder name for queue matching.
  const downloadedUrlsRef = useRef(new Set<string>());
  const playlistFolderByCanonicalRef = useRef(new Map<string, string>());

  const playlistCanonicalUrl = (() => {
    const target = pageContext.actionUrl ?? currentUrl;
    const listId = extractYouTubePlaylistId(target);
    if (listId) return `https://music.youtube.com/playlist?list=${listId}`;
    return canonicalMusicYouTubeUrl(target) ?? (target.trim() || null);
  })();

  const isPlaylistQueued = Boolean(
    playlistCanonicalUrl && downloadedUrlsRef.current.has(playlistCanonicalUrl),
  );

  const playlistOutputFolder = playlistCanonicalUrl
    ? playlistFolderByCanonicalRef.current.get(playlistCanonicalUrl)
    : undefined;
  const isPlaylistDownloadingInQueue = Boolean(
    playlistOutputFolder
    && downloadJobs.some(
      (j) =>
        j.options.playlistOutputFolder === playlistOutputFolder
        && (j.status === "queued" || j.status === "downloading" || j.status === "paused"),
    ),
  );

  const isPlaylistDownloading = downloadingPlaylist || isPlaylistDownloadingInQueue;
  const isPlaylistInLibrary = isPlaylistQueued && !isPlaylistDownloading;

  const submitPasteUrl = useCallback((raw?: string) => {
    const resolved = resolveMusicExplorePasteUrl((raw ?? pasteInputValue).trim());
    if (!resolved) return;
    onPasteUrlReady(resolved);
    setPasteInputValue("");
  }, [onPasteUrlReady, pasteInputValue]);

  useEffect(() => {
    if (!pasteMode) {
      setPasteInputValue("");
      setPasteChecking(false);
      return;
    }
    setPasteInputValue("");
    setPasteChecking(true);
    let cancelled = false;
    const run = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (cancelled) return;
        const resolved = resolveMusicExplorePasteUrl(text.trim());
        if (resolved) {
          onPasteUrlReady(resolved);
          setPasteInputValue("");
          return;
        }
      } catch {
        /* clipboard denied */
      }
      if (!cancelled) {
        setPasteChecking(false);
        inputRef.current?.focus();
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [pasteMode, onPasteUrlReady]);

  const downloadPlaylist = useCallback(async (targetUrl: string) => {
    const listId = extractYouTubePlaylistId(targetUrl);
    const canonical = listId
      ? `https://music.youtube.com/playlist?list=${listId}`
      : (canonicalMusicYouTubeUrl(targetUrl) ?? targetUrl.trim());
    if (!canonical) return;
    const dir = resolveDownloadOutputDir(saveToInternal, outputDir);
    const base = buildDownloadJobOptions(settings, dir);
    const opts = patchDownloadJobOptionsForAudio(base, true, settings);

    setDownloadingPlaylist(true);
    try {
      let folderName: string | undefined;
      const harvest = pageContext.harvestedTracklist;
      const harvestReady =
        harvest != null
        && harvestedTracklistAppliesToUrl(harvest, canonical)
        && isHarvestTracklistComplete(harvest);

      if (harvestReady) {
        let title = pageContext.pageTitle?.trim() || undefined;
        if (!title) {
          await throttleMusicExplorePageFetch();
          const titlePage = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
            url: canonical,
            offset: 0,
            limit: 1,
            browserCookies: settings.browserContext ?? null,
            cookieFile: settings.cookieFile ?? null,
          });
          title = titlePage.title?.trim() || undefined;
        }
        folderName = sanitizePlaylistFolderName(
          playlistFolderTitle(title ?? null, canonical),
        );
        const page = harvestedTracklistToPlaylistPage(harvest, canonical, title ?? "");
        page.items.forEach((track, i) => {
          enqueueDownload(
            track.url,
            { ...opts, playlistOutputFolder: folderName, playlistIndex: i + 1 },
            { title: track.title, approval: "held" },
          );
        });
      } else {
        // Harvest incomplete or mismatched — fall back to yt-dlp.
        let offset = 0;
        let hasMore = true;
        let pagesFetched = 0;
        while (hasMore && pagesFetched < MUSIC_EXPLORE_MAX_PLAYLIST_PAGES_PER_ACTION) {
          await throttleMusicExplorePageFetch();
          const page = await invoke<MusicPlaylistPage>("get_playlist_items_page", {
            url: canonical,
            offset,
            limit: 50,
            browserCookies: settings.browserContext ?? null,
            cookieFile: settings.cookieFile ?? null,
          });
          pagesFetched += 1;
          if (!folderName) {
            folderName = sanitizePlaylistFolderName(
              playlistFolderTitle(page.title ?? pageContext.pageTitle, canonical),
            );
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
      }

      releaseHeldDownloadJobs();
      pumpDownloadQueue();
      downloadedUrlsRef.current.add(canonical);
      if (folderName) playlistFolderByCanonicalRef.current.set(canonical, folderName);
    } catch (e) {
      debugLog("music.explore-download", "warn", "download playlist error", e);
    } finally {
      setDownloadingPlaylist(false);
    }
  }, [
    enqueueDownload,
    outputDir,
    pageContext.actionUrl,
    pageContext.harvestedTracklist,
    pageContext.pageTitle,
    pumpDownloadQueue,
    releaseHeldDownloadJobs,
    saveToInternal,
    settings,
  ]);

  const handleDownloadPlaylist = useCallback(() => {
    const target = pageContext.actionUrl ?? currentUrl;
    const hasListId =
      Boolean(target && (isMusicYouTubePlaylistUrl(target) || extractYouTubePlaylistId(target)));

    if (hasListId && target) {
      void downloadPlaylist(target);
      return;
    }

    onPickTracks();
  }, [currentUrl, downloadPlaylist, onPickTracks, pageContext.actionUrl]);

  const copyUrl = async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ok */ }
  };

  const btn =
    "h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/8 shrink-0 select-none";

  const showDownloadPlaylist =
    pageContext.kind === "playlist" || pageContext.canDownloadPlaylist;
  const showPickTracks =
    pageContext.canPickTracks && pageContext.kind !== "playlist";
  const contextLabel = pageContext.pageTitle
    ? `${pageKindLabel(pageContext.kind)} · ${pageContext.pageTitle}`
    : pageKindLabel(pageContext.kind);

  return (
    <div
      className="flex w-full min-w-0 flex-col shrink-0"
      style={{
        background: shellBlack ? "var(--music-bg)" : "var(--music-surface)",
        borderBottomRightRadius: "var(--music-panel-radius)",
      }}
    >
      {!pasteMode && (
        <div
          className="flex min-w-0 items-center gap-2 px-3 pt-1.5 pb-0.5"
          style={{ color: "var(--music-text-secondary)" }}
        >
          <span
            className="text-[10px] font-medium truncate min-w-0"
            style={{ color: "var(--music-accent)" }}
          >
            {contextLabel}
          </span>
        </div>
      )}

      <div
        className="flex w-full min-w-0 items-center gap-0.5 px-2 overflow-x-auto shrink-0"
        style={{
          height: "var(--music-explore-bar-height)",
          color: "var(--music-text-secondary)",
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
                className={cn(btn, "gap-1 rf-music-tooltip-anchor")}
                data-tooltip="Cancel"
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
              {showDownloadPlaylist && (
                <RippleBtn
                  type="button"
                  onClick={handleDownloadPlaylist}
                  disabled={downloadingPlaylist}
                  className={cn(btn, "rf-music-tooltip-anchor")}
                  data-tooltip={
                    isPlaylistDownloading
                      ? "Downloading tracks from this playlist"
                      : isPlaylistInLibrary
                        ? "Re-download this playlist"
                        : pageContext.canDownloadPlaylist
                          ? "Download every track in this playlist"
                          : "Open the download panel for this playlist"
                  }
                  style={{
                    color: isPlaylistInLibrary
                      ? "var(--music-text-secondary)"
                      : "var(--music-text-primary)",
                  }}
                >
                  {isPlaylistDownloading ? (
                    <Loader2 size={15} className="animate-spin" style={{ color: "var(--music-accent)" }} />
                  ) : isPlaylistInLibrary ? (
                    <CheckCheck size={15} style={{ color: "var(--music-accent)" }} />
                  ) : (
                    <Download size={15} style={{ color: "var(--music-accent)" }} />
                  )}
                  <span>
                    {isPlaylistDownloading
                      ? "Playlist downloading"
                      : isPlaylistInLibrary
                        ? "Playlist in library"
                        : `Download playlist${queueActive > 0 ? ` (${queueActive})` : ""}`}
                  </span>
                </RippleBtn>
              )}

              {showPickTracks && (
                <RippleBtn
                  type="button"
                  onClick={onPickTracks}
                  className={cn(btn, "rf-music-tooltip-anchor")}
                  data-tooltip="Browse and pick tracks to download"
                >
                  <ListMusic size={15} />
                  <span>Pick tracks</span>
                </RippleBtn>
              )}

              {pageContext.kind === "playlist" && pageContext.canDownloadPlaylist && (
                <RippleBtn
                  type="button"
                  onClick={onPickTracks}
                  className={cn(btn, "rf-music-tooltip-anchor")}
                  data-tooltip="Choose individual tracks"
                >
                  <ListMusic size={15} />
                  <span>Pick individual</span>
                </RippleBtn>
              )}

              <RippleBtn
                type="button"
                onClick={onActivatePaste}
                className={cn(btn, "rf-music-tooltip-anchor")}
                data-tooltip="Paste link"
              >
                <Link2 size={15} />
                <span>Paste link</span>
              </RippleBtn>

              <RippleBtn
                type="button"
                onClick={onReload}
                className={cn(btn, "rf-music-tooltip-anchor")}
                data-tooltip="Reload page"
              >
                <RefreshCw size={15} />
                <span>Reload</span>
              </RippleBtn>

              <div className="ml-auto flex items-center gap-0.5">
                <RippleBtn
                  type="button"
                  onClick={() => void updateSetting("autoDownloadPlayingSongs", settings.autoDownloadPlayingSongs === false)}
                  className={cn(btn, "rf-music-tooltip-anchor gap-1.5")}
                  data-tooltip={settings.autoDownloadPlayingSongs !== false ? "Auto-save on — click to disable" : "Auto-save off — click to enable"}
                  style={{
                    color: settings.autoDownloadPlayingSongs !== false
                      ? "var(--music-accent)"
                      : "var(--music-text-secondary)",
                  }}
                >
                  <CloudDownload size={15} />
                  <span>Auto-save</span>
                </RippleBtn>

                {currentUrl && (
                  <RippleBtn
                    type="button"
                    onClick={() => void copyUrl()}
                    className={cn(btn, "rf-music-tooltip-anchor")}
                    data-tooltip={copied ? "Copied!" : "Copy page URL"}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {copied ? (
                        <motion.span
                          key="check"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          transition={{ duration: 0.13 }}
                          style={{ display: "flex", color: "var(--music-accent)" }}
                        >
                          <Check size={15} />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="copy"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          transition={{ duration: 0.13 }}
                          style={{ display: "flex" }}
                        >
                          <Copy size={15} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <span>{copied ? "Copied" : "Copy URL"}</span>
                  </RippleBtn>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

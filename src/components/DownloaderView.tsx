import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import {
  Globe,
  Clock,
  Download,
  Info,
  HardDrive,
  List,
  Clipboard,
  Paperclip,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { DuplicateDownloadDialog } from "./DuplicateDownloadDialog";
import { downloadSubtitleLangLabel } from "../store/types";
import { formatApproxFileSize, formatDuration, formatHeroDownloadSpeed } from "./downloader/downloaderFormat";
import { BROWSER_OPTIONS } from "./downloader/downloaderConstants";
import {
  DownloadJobAudioToggle,
  UrlInputPacer,
} from "./downloader/DownloadJobQueuePanel";
import { MultiDownloadSlotCarousel } from "./downloader/MultiDownloadSlotCarousel";
import { downloadJobMediaNeedsHydration } from "../downloadQueue";
import { downloadJobDisplayFileSizeBytes } from "../downloadJobFileSizes";
import { useDownloaderView, type DownloaderViewProps } from "./downloader/useDownloaderView";
import { normalizeYouTubeUrlForCompare } from "../youtubeUrl";

const CLIP_ICON_TRANSITION = { duration: 0.32, ease: [0.23, 1, 0.32, 1] as const };

function MainDownloaderUrlChip({
  url,
  copied,
  pasted,
  onPasteFromClipboard,
  onCopy,
  onClear,
  audioWarning = false,
}: {
  url: string;
  copied: boolean;
  pasted?: boolean;
  onPasteFromClipboard: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onClear: () => void;
  audioWarning?: boolean;
}) {
  const [chipHovered, setChipHovered] = useState(false);
  const [copyHovered, setCopyHovered] = useState(false);
  const [pasteHovered, setPasteHovered] = useState(false);
  const [clearHovered, setClearHovered] = useState(false);

  return (
    <div
      className="pointer-events-auto w-full max-w-[min(380px,calc(100vw-2rem))]"
      onMouseEnter={() => setChipHovered(true)}
      onMouseLeave={() => {
        setChipHovered(false);
        setCopyHovered(false);
        setPasteHovered(false);
        setClearHovered(false);
      }}
    >
      <div
        className={`flex overflow-hidden rounded-lg transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          audioWarning
            ? "border border-dotted border-yellow-400/50 bg-yellow-400/10 text-yellow-400"
            : "border border-white/10 bg-[#271C18]/95 text-[#EDD79C]/85 shadow-[0_4px_20px_rgba(0,0,0,0.35)]"
        } backdrop-blur-md ${
          audioWarning || chipHovered ? "max-w-[min(380px,calc(100vw-3rem))]" : "max-w-9"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {audioWarning ? (
            <motion.div
              key="audio-warn-inner"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={CLIP_ICON_TRANSITION}
              className="flex h-9 items-center gap-2 px-3 whitespace-nowrap"
            >
              <AlertTriangle size={12} strokeWidth={3} className="shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-wider">
                Download time increased - Download size decreased
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="normal-inner"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={CLIP_ICON_TRANSITION}
              className="flex flex-1 min-w-0"
            >
              <button
                type="button"
                onClick={() => void onPasteFromClipboard()}
                onMouseEnter={() => setPasteHovered(true)}
                onMouseLeave={() => setPasteHovered(false)}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center"
                aria-label="Paste link from clipboard"
              >
                <span
                  className={`pointer-events-none absolute bottom-full left-1/2 z-[4] mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.22em] text-[#EDD79C]/90 shadow-md ring-1 ring-white/10 transition-opacity duration-300 ${
                    pasteHovered ? "opacity-100" : "opacity-0"
                  }`}
                  role="tooltip"
                >
                  Paste link
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  {pasted ? (
                    <motion.span
                      key="main-paste-ok"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={CLIP_ICON_TRANSITION}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Check size={14} strokeWidth={2.5} className="text-[color:var(--accent)]" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="main-cl"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={CLIP_ICON_TRANSITION}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Paperclip size={14} strokeWidth={2} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
              <button
                type="button"
                onClick={() => void onCopy()}
                onMouseEnter={() => setCopyHovered(true)}
                onMouseLeave={() => setCopyHovered(false)}
                className="relative min-w-0 flex-1 truncate whitespace-nowrap py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#EDD79C]/90 transition-[opacity,padding] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-white"
                aria-label="Copy link"
              >
                <span
                  className={`pointer-events-none absolute bottom-full left-1/2 z-[4] mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.22em] text-[#EDD79C]/90 shadow-md ring-1 ring-white/10 transition-opacity duration-300 ${
                    copyHovered ? "opacity-100" : "opacity-0"
                  }`}
                  role="tooltip"
                >
                  Copy link
                </span>
                <span
                  className={`block truncate transition-opacity duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    chipHovered ? "px-2 opacity-100" : "opacity-0"
                  }`}
                >
                  {copied ? "Copied" : url}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                onMouseEnter={() => setClearHovered(true)}
                onMouseLeave={() => setClearHovered(false)}
                className={`relative flex h-9 shrink-0 items-center justify-center overflow-hidden text-[#EDD79C]/40 transition-[opacity,width,padding,color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#EDD79C] ${
                  chipHovered ? "pointer-events-auto w-8 opacity-100" : "pointer-events-none w-0 min-w-0 opacity-0"
                }`}
                aria-label="Clear link"
              >
                <span
                  className={`pointer-events-none absolute bottom-full left-1/2 z-[4] mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.22em] text-[#EDD79C]/90 shadow-md ring-1 ring-white/10 transition-opacity duration-300 ${
                    clearHovered && chipHovered ? "opacity-100" : "opacity-0"
                  }`}
                  role="tooltip"
                >
                  Clear link
                </span>
                <X size={12} strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QuickEnqueuePinnedChip({
  url,
  onRemove,
  copyUrl,
}: {
  url: string;
  onRemove: () => void;
  copyUrl: (u: string) => Promise<void>;
}) {
  const [chipHovered, setChipHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyHovered, setCopyHovered] = useState(false);
  const [clearHovered, setClearHovered] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    await copyUrl(url);
    setCopied(true);
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => {
      setCopied(false);
      copyResetRef.current = null;
    }, 2000);
  };

  return (
    <div
      className="pointer-events-auto w-full max-w-[min(380px,calc(100vw-2rem))] self-start"
      onMouseEnter={() => setChipHovered(true)}
      onMouseLeave={() => {
        setChipHovered(false);
        setCopyHovered(false);
        setClearHovered(false);
      }}
    >
      <div
        className={`flex shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#271C18]/95 text-[#EDD79C]/85 shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[max-width,width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          chipHovered ? "w-full max-w-[min(380px,calc(100vw-3rem))]" : "w-9 max-w-9"
        }`}
      >
        <button
          type="button"
          onClick={() => void handleCopy()}
          onMouseEnter={() => setCopyHovered(true)}
          onMouseLeave={() => setCopyHovered(false)}
          className="relative flex min-w-0 flex-1 items-center overflow-hidden text-left"
          aria-label="Copy link"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            <span
              className={`pointer-events-none absolute bottom-full left-1/2 z-[4] mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.22em] text-[#EDD79C]/90 shadow-md ring-1 ring-white/10 transition-opacity duration-300 ${
                copyHovered ? "opacity-100" : "opacity-0"
              }`}
              role="tooltip"
            >
              Click to copy
            </span>
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="pin-ok"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={CLIP_ICON_TRANSITION}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Check size={14} strokeWidth={2.5} className="text-[color:var(--accent)]" />
                </motion.span>
              ) : (
                <motion.span
                  key={`pin-cl-${url}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={CLIP_ICON_TRANSITION}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Paperclip size={14} strokeWidth={2} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span
            className={`min-w-0 flex-1 truncate whitespace-nowrap py-2 text-[9px] font-bold uppercase tracking-widest text-[#EDD79C]/90 transition-[opacity,padding] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              chipHovered ? "px-2 pr-1 opacity-100" : "opacity-0"
            }`}
          >
            {url}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onMouseEnter={() => setClearHovered(true)}
          onMouseLeave={() => setClearHovered(false)}
          className={`relative flex h-9 shrink-0 items-center justify-center overflow-hidden text-[#EDD79C]/40 transition-[opacity,width,padding,color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#EDD79C] ${
            chipHovered ? "pointer-events-auto w-8 opacity-100" : "pointer-events-none w-0 min-w-0 opacity-0"
          }`}
          aria-label="Remove from list"
        >
          <span
            className={`pointer-events-none absolute bottom-full left-1/2 z-[4] mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.22em] text-[#EDD79C]/90 shadow-md ring-1 ring-white/10 transition-opacity duration-300 ${
              clearHovered && chipHovered ? "opacity-100" : "opacity-0"
            }`}
            role="tooltip"
          >
            Remove
          </span>
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

export const DownloaderView = (props: DownloaderViewProps) => {
  const d = useDownloaderView(props);

  const idleHero = !d.showImmersiveDownload
    ? (() => {
      if (d.videoInfo && !d.metadataLoading) {
        return {
          title: d.videoInfo.title,
          duration: d.videoInfo.duration,
          fileSizeBytes:
            downloadJobDisplayFileSizeBytes(
              {
                title: d.videoInfo.title,
                thumbnail: d.videoInfo.thumbnail,
                duration: d.videoInfo.duration,
                isPlaylist: d.videoInfo.isPlaylist,
                fileSizeBytes: d.videoInfo.fileSizeBytes ?? null,
                fileSizeBytesAudio: d.videoInfo.fileSizeBytesAudio ?? null,
                fileSizeBytesVideo: d.videoInfo.fileSizeBytesVideo ?? null,
              },
              d.heroAudioOnly,
            ) ?? null,
          isPlaylist: d.videoInfo.isPlaylist,
          playlistItems: d.videoInfo.playlistItems,
          loading: false,
        };
      }
      if (d.focusedJob && d.focusedJob.status !== "downloading") {
        const m = d.focusedJob.metadata;
        const needs = downloadJobMediaNeedsHydration(m);
        const rawTitle = (d.focusedJob.title ?? m?.title ?? "").trim();
        if (needs && !rawTitle) {
          return {
            title: d.downloadStartPending ? "Starting download…" : "Fetching details…",
            duration: 0,
            fileSizeBytes: null,
            isPlaylist: false,
            playlistItems: undefined,
            loading: true,
          };
        }
        const title =
          rawTitle || (needs ? "Fetching details…" : (d.focusedJob.url || "Video").trim());
        const jobAudioOnly = d.focusedJob.options.audioOnly === true;
        return {
          title,
          duration: needs ? 0 : (m?.duration ?? 0),
          fileSizeBytes: needs ? null : downloadJobDisplayFileSizeBytes(m, jobAudioOnly),
          isPlaylist: Boolean(m?.isPlaylist),
          playlistItems: m?.playlistItems,
          loading: needs,
        };
      }
      if (
        d.url.startsWith("http") &&
        (d.metadataLoading || d.downloadStartPending || d.showDuplicateBanner)
      ) {
        return {
          title: d.downloadStartPending
            ? "Starting download…"
            : d.metadataLoading
              ? "Fetching details…"
              : (d.libraryDuplicateTitle ?? "Already in your library"),
          duration: 0,
          fileSizeBytes: null,
          isPlaylist: false,
          playlistItems: undefined,
          loading: d.metadataLoading || d.downloadStartPending,
        };
      }
      return null;
    })()
    : null;

  const displayHero = d.batchQueuePlaylistView ?? idleHero;
  const displayHeroBytes =
    d.batchQueueHeroDisplayBytes ??
    (displayHero?.isPlaylist ? d.playlistHeroDisplayBytes : null);

  const heroThumb = d.heroBackdropThumb.trim();

  const bigProgressPctRaw = d.progress?.percentage ?? 0;
  const bigProgressPct = Number.isFinite(bigProgressPctRaw)
    ? Math.min(100, Math.max(0, bigProgressPctRaw))
    : 0;
  const heroSpeedLabel = formatHeroDownloadSpeed(d.progress?.speed);

  const downloadCarouselItems =
    d.collectionDownloadCarousel?.items ??
    (d.focusedJob?.metadata?.isPlaylist && d.focusedJob.metadata.playlistItems
      ? d.focusedJob.metadata.playlistItems
      : null);
  const downloadCarouselCurrentIndex =
    d.collectionDownloadCarousel?.currentIndex ?? d.progress?.currentIndex ?? 0;
  const isMultiItemDownload = Boolean(downloadCarouselItems && downloadCarouselItems.length > 1);
  const multiDownloadTitle =
    (isMultiItemDownload
      ? downloadCarouselItems?.[downloadCarouselCurrentIndex]?.title
      : null) ||
    d.progress?.currentItemTitle ||
    downloadCarouselItems?.[downloadCarouselCurrentIndex]?.title ||
    "";

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {d.replaceDialogOpen && d.replaceDialogMatch && (
        <DuplicateDownloadDialog
          open
          videoTitle={d.replaceDialogMatch.file.name ?? d.videoInfo?.title}
          match={d.replaceDialogMatch}
          onChoose={d.handleDuplicateChoice}
        />
      )}
      {heroThumb ? (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={heroThumb}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0"
            >
              <img
                src={heroThumb}
                alt=""
                className="h-full w-full object-cover opacity-40 blur-[12px] saturate-[1.1]"
              />
            </motion.div>
          </AnimatePresence>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#1D1613]/80 via-transparent to-[#1D1613]" />
        </div>
      ) : null}
      <div className="relative z-10 flex h-full flex-col p-4 sm:p-10 lg:p-16">
        <AnimatePresence>
          {d.showYtdlpStrip && (
            <motion.div
              key="ytdlp-update-strip"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              role="region"
              aria-label="yt-dlp update available"
              className="mb-4 shrink-0 rounded-xl border border-[color-mix(in_srgb,var(--accent),transparent_72%)] bg-[#271C18]/92 px-4 py-3 text-[#EDD79C]/90 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md sm:mb-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[color:var(--accent)]/90">
                    yt-dlp update
                  </p>
                  <p className="text-xs font-semibold tracking-tight text-[#EDD79C]/85">
                    {d.ytdlpUpdateStatus?.latestVersion != null &&
                    d.ytdlpUpdateStatus.latestVersion !== ""
                      ? `Release ${d.ytdlpUpdateStatus.latestVersion} is available. You're on ${d.ytdlpUpdateStatus.activeVersion}.`
                      : `A newer yt-dlp release is available (current ${d.ytdlpUpdateStatus?.activeVersion ?? "unknown"}).`}
                  </p>
                  {d.ytdlpUpdateInvokeError != null ? (
                    <p className="text-[11px] text-amber-300/95">{d.ytdlpUpdateInvokeError}</p>
                  ) : d.ytdlpUpdateStatus?.checkError ? (
                    <p className="text-[11px] text-stone-500/90">{d.ytdlpUpdateStatus.checkError}</p>
                  ) : null}
                  {typeof d.ytdlpUpdatePercent === "number" && (
                    <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-200"
                        style={{
                          width: `${Math.min(100, Math.max(0, d.ytdlpUpdatePercent))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={d.ytdlpUpdating}
                    onClick={() => void d.downloadYtdlpUpdateNow()}
                    className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#1D1613] shadow-sm transition-opacity disabled:opacity-50"
                  >
                    {d.ytdlpUpdating ? "Updating…" : "Update yt-dlp"}
                  </button>
                  <button
                    type="button"
                    disabled={d.ytdlpUpdating}
                    onClick={d.dismissYtdlpUpdateBanner}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#EDD79C]/65 transition-colors hover:bg-white/5 hover:text-[#EDD79C]"
                  >
                    Later
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!d.anyDownloading && !d.url.startsWith("http") && !d.queueBrowsingHidesUrlChrome && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="hidden min-[800px]:flex flex-col items-center gap-2 sm:gap-4 mb-4 sm:mb-8"
            >
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                {BROWSER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => d.handleBrowserChange(opt.value)}
                    className="flex items-center gap-2 group transition-all duration-300"
                  >
                    <div
                      className={`w-1 h-1 rounded-full transition-all duration-300 ${d.browserContextUi === opt.value ? "bg-[color:var(--accent)] scale-150" : "bg-stone-800 group-hover:bg-stone-600"}`}
                    />
                    <span
                      className={`text-[8px] font-black uppercase tracking-[0.3em] ${
                        d.browserContextUi === opt.value
                          ? "text-[color:var(--accent)]"
                          : "text-stone-700 group-hover:text-stone-500"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
              <AnimatePresence>
                {!d.browserContextUi && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent),transparent_90%)] bg-[color-mix(in_srgb,var(--accent),transparent_95%)]"
                  >
                    <Info size={10} className="text-[color:var(--accent)] opacity-40" />
                    <span className="text-[7px] font-black text-[color:var(--accent)] opacity-30 uppercase tracking-[0.2em]">
                      None: public videos. Pick Internal or Firefox for signed-in content.
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex-1 flex flex-col justify-center w-full min-h-0">
          <LayoutGroup id="downloader-url">
            <AnimatePresence mode="popLayout">
              {d.showTopLeftDownloaderChrome && (
                <motion.div
                  key={d.showUrlBubble ? "url-pill" : "queue-add-tools"}
                  layoutId={d.showUrlBubble ? "downloader-url-chip" : undefined}
                  transition={d.urlChipLayoutTransition}
                  className="pointer-events-none absolute left-4 top-12 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col items-stretch gap-2 sm:left-6 sm:top-14 lg:left-8 lg:top-14"
                >
                  {d.showMainUrlChip && (
                    <MainDownloaderUrlChip
                      url={d.url}
                      copied={d.urlBubbleCopied}
                      pasted={d.clipboardPastedHint}
                      onPasteFromClipboard={() => void d.handleUrlClipPaste()}
                      onCopy={() => void d.handleUrlClipCopy()}
                      onClear={d.handleClearUrl}
                      audioWarning={d.showAudioWarning}
                    />
                  )}

                  {!d.anyDownloading && d.showQueueAddToolbar && d.pinnedQuickEnqueueUrls.length > 0 && (
                    <div className="pointer-events-auto flex w-full flex-col gap-1.5">
                      {d.pinnedQuickEnqueueUrls.map((u) => (
                        <QuickEnqueuePinnedChip
                          key={normalizeYouTubeUrlForCompare(u)}
                          url={u}
                          onRemove={() => d.removePinnedQuickEnqueueUrl(u)}
                          copyUrl={d.copyUrlToClipboard}
                        />
                      ))}
                    </div>
                  )}

                  {!d.anyDownloading && d.showQueueAddToolbar && (
                    <button
                      type="button"
                      disabled={d.storageBlocksNewDownloads}
                      title={
                        d.storageBlocksNewDownloads
                          ? "Library storage limit reached. Free space in Settings or switch to an external download folder."
                          : undefined
                      }
                      onClick={() => void d.handleQuickEnqueueFromClipboard()}
                      className="group/qe pointer-events-auto inline-flex h-9 max-w-9 shrink-0 items-center self-start overflow-hidden rounded-lg border border-dotted border-[#EDD79C]/50 bg-[#271C18]/95 text-[#EDD79C]/85 shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[max-width,border-color] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:max-w-[min(260px,calc(100vw-3rem))] hover:border-[#EDD79C]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:max-w-9"
                      aria-label="Queue another from clipboard"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                        <Clipboard size={14} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 whitespace-nowrap py-2 pr-3 text-[8px] font-black uppercase tracking-[0.28em] text-[#EDD79C]/65 opacity-0 transition-opacity duration-300 group-hover/qe:opacity-100">
                        Queue another
                      </span>
                    </button>
                  )}

                  {!d.anyDownloading && d.showQueueAddToolbar && (
                    <div className="pointer-events-none flex h-10 w-full shrink-0 items-start overflow-hidden px-0.5 pt-0.5">
                      <AnimatePresence mode="wait" initial={false}>
                        {d.quickEnqueueHint === "empty" && (
                          <motion.p
                            key="qe-empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                            className="line-clamp-2 w-full text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                          >
                            No YouTube link in clipboard
                          </motion.p>
                        )}
                        {d.quickEnqueueHint === "conflict" && (
                          <motion.p
                            key="qe-conflict"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                            className="line-clamp-2 w-full text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                          >
                            Same link as the bar or already queued / downloading
                          </motion.p>
                        )}
                        {d.quickEnqueueHint === "library_skip" && (
                          <motion.p
                            key="qe-lib"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                            className="line-clamp-2 w-full text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                          >
                            Already in library (skipped). Turn off Skip duplicates to choose.
                          </motion.p>
                        )}
                        {d.quickEnqueueHint === "storage_full" && (
                          <motion.p
                            key="qe-storage"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                            className="line-clamp-3 w-full text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                          >
                            Library storage is full. Free space in Settings or use an external folder.
                          </motion.p>
                        )}
                        {d.quickEnqueueHint === "wait_metadata" && (
                          <motion.p
                            key="qe-wait"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                            className="line-clamp-2 w-full text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                          >
                            Wait for the current link to finish loading before queueing another
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              )}
              {!d.showUrlBubble && !d.anyDownloading && !d.queueBrowsingHidesUrlChrome && (
                <motion.div
                  key="url-input"
                  layout
                  layoutId="downloader-url-chip"
                  transition={d.urlChipLayoutTransition}
                  className="relative group mx-auto w-full max-w-2xl pt-2 sm:pt-6 hidden min-[700px]:block"
                >
                  <AnimatePresence>
                    {!d.showUrlBubble && d.urlSourceHint === "clipboard" && d.clipboardPastedHint && (
                      <motion.p
                        key="clipboard-pasted-hint"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        className="pb-2 text-center text-[8px] font-black uppercase tracking-[0.25em] text-stone-500"
                      >
                        Pasted from clipboard
                      </motion.p>
                    )}
                    {!d.showUrlBubble && d.urlSourceHint === "explorer" && (
                      <motion.p
                        key="explorer-added-hint"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        className="pb-2 text-center text-[8px] font-black uppercase tracking-[0.25em] text-stone-500"
                      >
                        Added from watch page
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <div
                    className="w-full cursor-text"
                    onClick={() => d.handleUrlClick()}
                    role="presentation"
                  >
                    <input
                      type="text"
                      value={d.url}
                      onChange={(e) => d.handleUrlChange(e.target.value)}
                      onFocus={d.handleUrlFocus}
                      onBlur={d.handleUrlBlur}
                      onPaste={(e) => d.handleUrlPaste(e)}
                      placeholder="PASTE LINK"
                      className="w-full bg-transparent text-center text-lg sm:text-xl font-black tracking-[0.2em] text-stone-100 placeholder:text-stone-800 outline-none border-none transition-all uppercase"
                    />
                  </div>
                  {d.clipboardOfferUrl && (
                    <div className="pt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-stone-500">
                        Clipboard has a YouTube link:
                      </span>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={d.applyClipboardOffer}
                        className="text-[8px] font-black uppercase tracking-[0.2em] text-[color:var(--accent)] hover:opacity-80"
                      >
                        Use it?
                      </button>
                    </div>
                  )}
                  <motion.div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                    <UrlInputPacer
                      expanded={d.isFocused || d.metadataLoading}
                      loading={d.metadataLoading}
                    />
                  </motion.div>
                  {d.metadataError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute left-0 right-0 top-full pt-4 text-center z-50"
                    >
                      <span className="text-red-400 text-[9px] font-black uppercase tracking-[0.2em] bg-red-400/5 px-3 py-1.5 rounded-full border border-red-400/10 inline-block max-w-lg truncate">
                        {d.metadataError}
                      </span>
                    </motion.div>
                  )}
                  {!d.anyDownloading &&
                    d.showQueueAddToolbar &&
                    d.url.startsWith("http") &&
                    !d.metadataLoading && (
                    <div className="mt-6 flex w-full max-w-md flex-col items-stretch gap-2 px-2 mx-auto">
                      {d.pinnedQuickEnqueueUrls.length > 0 && (
                        <div className="flex w-full flex-col gap-1.5">
                          {d.pinnedQuickEnqueueUrls.map((u) => (
                            <QuickEnqueuePinnedChip
                              key={normalizeYouTubeUrlForCompare(u)}
                              url={u}
                              onRemove={() => d.removePinnedQuickEnqueueUrl(u)}
                              copyUrl={d.copyUrlToClipboard}
                            />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={d.storageBlocksNewDownloads}
                        title={
                          d.storageBlocksNewDownloads
                            ? "Library storage limit reached. Free space in Settings or switch to an external download folder."
                            : undefined
                        }
                        onClick={() => void d.handleQuickEnqueueFromClipboard()}
                        className="group/qe pointer-events-auto mx-auto inline-flex h-9 max-w-9 shrink-0 items-center overflow-hidden rounded-lg border border-dotted border-[#EDD79C]/50 bg-[#271C18]/95 text-[#EDD79C]/85 shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[max-width,border-color] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:max-w-[min(280px,calc(100vw-3rem))] hover:border-[#EDD79C]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:max-w-9"
                        aria-label="Queue another from clipboard"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                          <Clipboard size={14} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 whitespace-nowrap py-2 pr-4 text-[8px] font-black uppercase tracking-[0.28em] text-[#EDD79C]/65 opacity-0 transition-opacity duration-300 group-hover/qe:opacity-100">
                          Queue another
                        </span>
                      </button>
                      <div className="pointer-events-none flex h-10 w-full shrink-0 items-start justify-center overflow-hidden pt-0.5 text-center">
                        <AnimatePresence mode="wait" initial={false}>
                          {d.quickEnqueueHint === "empty" && (
                            <motion.p
                              key="qe-empty-c"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                              className="line-clamp-2 w-full px-2 text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                            >
                              No YouTube link in clipboard
                            </motion.p>
                          )}
                          {d.quickEnqueueHint === "conflict" && (
                            <motion.p
                              key="qe-conflict-c"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                              className="line-clamp-2 w-full px-2 text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                            >
                              Same link as above or already queued / downloading
                            </motion.p>
                          )}
                          {d.quickEnqueueHint === "library_skip" && (
                            <motion.p
                              key="qe-lib-c"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                              className="line-clamp-2 w-full px-2 text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                            >
                              Already in library (skipped)
                            </motion.p>
                          )}
                          {d.quickEnqueueHint === "storage_full" && (
                            <motion.p
                              key="qe-storage-c"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                              className="line-clamp-3 w-full px-2 text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                            >
                              Library storage is full. Free space in Settings or use an external folder.
                            </motion.p>
                          )}
                          {d.quickEnqueueHint === "wait_metadata" && (
                            <motion.p
                              key="qe-wait-c"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                              className="line-clamp-2 w-full px-2 text-[8px] font-bold uppercase leading-snug tracking-[0.18em] text-stone-500"
                            >
                              Wait for the current link to finish loading before queueing another
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="w-full max-w-6xl mx-auto space-y-2 sm:space-y-8">
              {!d.showImmersiveDownload ? (
                <div className="space-y-4 sm:space-y-10">
                  <AnimatePresence mode="wait">
                    {displayHero ? (
                      <motion.div
                        key="video-details"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                        className="text-center space-y-2 sm:space-y-6"
                      >
                        <h2
                          className={`font-black leading-[1.08] sm:leading-[1.1] tracking-tighter line-clamp-2 px-4 pb-0.5 ${
                            displayHero.loading
                              ? "text-lg sm:text-2xl lg:text-3xl text-white/55"
                              : "text-xl sm:text-4xl lg:text-6xl text-white"
                          }`}
                        >
                          {displayHero.title}
                        </h2>
                        {!displayHero.loading && (
                        <div className="hidden min-[600px]:flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-8 gap-y-2 text-[10px] font-black uppercase tracking-[0.3em] text-[color:var(--accent)] opacity-60">
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} className="opacity-50" />
                            <span>{formatDuration(displayHero.duration)}</span>
                          </div>
                          {(() => {
                            const bytes =
                              displayHero.isPlaylist && displayHeroBytes != null
                                ? displayHeroBytes
                                : displayHero.fileSizeBytes;
                            if (bytes == null || bytes <= 0) return null;
                            return (
                              <div className="flex items-center gap-1.5">
                                <HardDrive size={12} className="opacity-50" />
                                <span title="Approximate size">~{formatApproxFileSize(bytes)}</span>
                              </div>
                            );
                          })()}
                          {displayHero.isPlaylist && (
                            <div className="flex items-center gap-1.5">
                              <List size={12} className="opacity-50" />
                              <span>{displayHero.playlistItems?.length || 0} Videos</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Globe size={12} className="opacity-50" />
                            <span>YouTube</span>
                          </div>
                        </div>
                        )}
                        {d.showDuplicateBanner && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rf-duplicate-banner mx-auto max-w-lg rounded-2xl border border-white/5 bg-[#271C18]/60 px-6 py-4 text-center backdrop-blur-md"
                            role="status"
                          >
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#EDD79C]">
                              Already in your library
                            </p>
                            <p className="mt-2 text-[10px] leading-relaxed text-[#EDD79C]/50">
                              {d.duplicateBannerAutoSkip ? (
                                <>
                                  This link matches a video you already have. Download will be skipped
                                  automatically.
                                </>
                              ) : (
                                <>
                                  This link matches a video in your collection. Hit{" "}
                                  <span className="text-[#EDD79C]/80">Download</span> to replace it
                                  or save a copy.
                                </>
                              )}
                            </p>
                          </motion.div>
                        )}
                        {d.playlistDuplicateSummary && !d.batchQueuePlaylistView && (
                          <p className="text-center text-[9px] font-black uppercase tracking-[0.28em] text-stone-500">
                            {d.playlistDuplicateSummary}
                            {d.playlistEnqueuePlan &&
                              d.playlistEnqueuePlan.toDownload.length === 0 &&
                              " · nothing new to download"}
                          </p>
                        )}
                        <motion.div className="space-y-4 pt-2 sm:space-y-5 sm:pt-6">
                          {!displayHero.loading &&
                            d.settings.downloadSubtitles &&
                            d.subLangsForDisplay && (
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="text-[8px] font-black uppercase tracking-[0.4em] text-stone-600">
                                Enqueued Captions
                              </span>
                              <p className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                                {downloadSubtitleLangLabel(d.subLangsForDisplay)}
                              </p>
                            </div>
                          )}
                          {(d.showHeroAudioToggle || d.showPrimaryDownload) && (
                            <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
                              {d.showHeroAudioToggle && (
                                <DownloadJobAudioToggle
                                  audioOnly={d.heroAudioOnly}
                                  onToggle={d.toggleHeroAudio}
                                  className="scale-110 sm:scale-125"
                                />
                              )}
                              {d.showPrimaryDownload && (
                                <button
                                  type="button"
                                  disabled={d.storageBlocksNewDownloads || d.downloadStartPending}
                                  title={
                                    d.storageBlocksNewDownloads
                                      ? "Library storage limit reached. Free space in Settings or switch to an external download folder."
                                      : d.downloadStartPending
                                        ? "Download will start when details are ready"
                                        : undefined
                                  }
                                  onClick={d.handleDownloadClick}
                                  className={`flex items-center gap-3 rounded-full bg-[color:var(--accent)] px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.4em] text-stone-950 shadow-xl transition-all duration-300 hover:scale-105 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-[color:var(--accent)] sm:gap-4 sm:px-12 sm:py-4 sm:text-xs ${
                                    d.downloadStartPending ? "animate-pulse" : ""
                                  }`}
                                >
                                  <Download size={14} />
                                  {d.downloadStartPending ? "Starting…" : "Download"}
                                </button>
                              )}
                            </div>
                          )}
                        </motion.div>
                        {displayHero.isPlaylist && displayHero.playlistItems && (
                          <div className="max-w-xl mx-auto mt-4 sm:mt-8 pt-4 sm:pt-8 border-t border-white/5 h-[100px] sm:h-[250px] overflow-y-auto space-y-1.5 hidden min-[750px]:block">
                            {displayHero.playlistItems.map((item, idx) => {
                              const batchJob = d.batchQueuePlaylistView
                                ? d.batchQueueJobs.find((j) => j.id === item.id)
                                : null;
                              const rowKey = batchJob
                                ? batchJob.id
                                : d.playlistItemKey(item, idx + 1);
                              const rowAudio = batchJob
                                ? batchJob.options.audioOnly === true
                                : d.resolveAudioOnlyForPlaylistItem(
                                    rowKey,
                                    d.playlistItemAudioOverrides,
                                    d.heroAudioOnly,
                                  );
                              const dup = batchJob
                                ? d.isBatchQueueJobDuplicate(item.webpageUrl)
                                : d.isPlaylistItemDuplicate(item);
                              const rowBytes = rowAudio
                                ? (item.fileSizeBytesAudio ?? item.fileSizeBytes)
                                : (item.fileSizeBytesVideo ?? item.fileSizeBytes);
                              return (
                                <div
                                  key={`playlist-row-${idx}-${item.webpageUrl ?? item.title}`}
                                  className={`flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group ${
                                    dup ? "opacity-55" : ""
                                  } ${batchJob?.status === "downloading" ? "bg-white/[0.04]" : ""}`}
                                >
                                  <div className="w-24 aspect-video rounded-lg overflow-hidden bg-stone-900 flex-shrink-0 relative">
                                    {item.thumbnail ? (
                                      <img
                                        src={item.thumbnail}
                                        alt=""
                                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                      />
                                    ) : (
                                      <div className="h-full w-full bg-stone-800" />
                                    )}
                                    {dup && (
                                      <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-[#EDD79C]">
                                        In library
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex-1 text-left min-w-0">
                                    <h4 className="text-[11px] font-black uppercase tracking-widest text-stone-400 group-hover:text-white truncate">
                                      {item.title}
                                    </h4>
                                    <span className="text-[10px] font-mono text-stone-600 mt-1 block">
                                      {formatDuration(item.duration)}
                                      {rowBytes != null && rowBytes > 0
                                        ? ` · ~${formatApproxFileSize(rowBytes)}`
                                        : ""}
                                    </span>
                                  </div>
                                  <DownloadJobAudioToggle
                                    audioOnly={rowAudio}
                                    onToggle={() =>
                                      batchJob
                                        ? d.toggleBatchQueueJobAudio(batchJob.id, !rowAudio)
                                        : d.togglePlaylistItemAudio(rowKey, !rowAudio)
                                    }
                                    className="shrink-0 scale-90"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div className="relative flex h-full flex-col items-center justify-center gap-8 px-6">
                  {!isMultiItemDownload ? (
                    <motion.h3
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="max-w-4xl text-center text-4xl font-black uppercase leading-[0.9] tracking-tighter text-white drop-shadow-2xl line-clamp-2 lg:text-7xl"
                    >
                      {d.progress?.currentItemTitle ||
                        d.focusedJob?.metadata?.title ||
                        d.focusedJob?.title ||
                        d.focusedJob?.url}
                    </motion.h3>
                  ) : null}
                  {!isMultiItemDownload ? (
                    <div className="w-full max-w-md">
                      <div className="relative h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--accent)]"
                          initial={false}
                          animate={{ width: `${bigProgressPct}%` }}
                          transition={{ duration: 0 }}
                        />
                      </div>
                      {heroSpeedLabel ? (
                        <p className="mt-4 text-center text-sm font-bold tabular-nums tracking-tight text-[color:var(--accent)]">
                          {heroSpeedLabel}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {isMultiItemDownload && downloadCarouselItems ? (
                    <MultiDownloadSlotCarousel
                      items={downloadCarouselItems}
                      currentIndex={downloadCarouselCurrentIndex}
                      percentage={d.progress?.percentage || 0}
                      speedLabel={heroSpeedLabel}
                      currentTitle={multiDownloadTitle}
                    />
                  ) : null}
                </motion.div>
              )}
            </div>
          </LayoutGroup>
        </div>
      </div>
    </div>
  );
};

import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { Ban, Download, Info } from "lucide-react";
import { DuplicateDownloadDialog } from "./DuplicateDownloadDialog";
import { downloadSubtitleLangLabel } from "../store/types";
import {
  formatHeroDownloadSpeed,
  sanitizeCarouselDisplayTitle,
} from "./downloader/downloaderFormat";
import { HeroFormatSwitch } from "./downloader/HeroFormatSwitch";
import { HeroStats } from "./downloader/HeroStats";
import {
  DownloaderUrlChip,
  QuickEnqueueButton,
  QuickEnqueuePinnedChip,
} from "./downloader/LinkChips";
import { PlaylistPreviewList } from "./downloader/PlaylistPreviewList";
import { PlaylistPreviewRow } from "./downloader/PlaylistPreviewRow";
import { BROWSER_OPTIONS } from "./downloader/downloaderConstants";
import { UrlInputPacer } from "./downloader/DownloadJobQueuePanel";
import {
  ImmersiveDownloadHero,
  resolveImmersiveDownloadPhase,
} from "./downloader/ImmersiveDownloadHero";
import { MultiDownloadSlotCarousel } from "./downloader/MultiDownloadSlotCarousel";
import { ProgressBarStreak } from "./downloader/ProgressBarStreak";
import { StorageBlockNote } from "./downloader/StorageBlockNote";
import { YtdlpUpdateBanner } from "./downloader/YtdlpUpdateBanner";
import {
  downloadJobMediaNeedsHydration,
  jobHasDownloadTransferStarted,
} from "../downloadQueue";
import { downloadJobDisplayFileSizeBytes } from "../downloadJobFileSizes";
import { useDownloaderView, type DownloaderViewProps } from "./downloader/useDownloaderView";
import { normalizeYouTubeUrlForCompare } from "../youtubeUrl";

const STORAGE_BLOCK_TIP =
  "Library storage limit reached. Free space in Settings or switch to an external download folder.";

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
            title: d.downloadStartPending ? "Starting soon…" : "Fetching details…",
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
        const statusOnly =
          (d.metadataLoading || d.downloadStartPending) && !d.showDuplicateBanner;
        return {
          title: statusOnly
            ? ""
            : d.downloadStartPending
              ? "Starting soon…"
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

  const bigProgressPctRaw = d.progress?.percentage ?? 0;
  const bigProgressPct = Number.isFinite(bigProgressPctRaw)
    ? Math.min(100, Math.max(0, bigProgressPctRaw))
    : 0;
  const heroSpeedLabel = formatHeroDownloadSpeed(d.progress?.speed);
  const immersiveTitle =
    sanitizeCarouselDisplayTitle(d.progress?.currentItemTitle) ||
    sanitizeCarouselDisplayTitle(d.focusedJob?.metadata?.title) ||
    sanitizeCarouselDisplayTitle(d.focusedJob?.title) ||
    "Download";
  const immersiveTransferStarted = d.focusedJob
    ? jobHasDownloadTransferStarted(d.focusedJob)
    : bigProgressPct > 0 || d.progress?.status === "processing";
  const immersivePhase = resolveImmersiveDownloadPhase({
    transferStarted: immersiveTransferStarted,
    progressStatus: d.progress?.status,
    percentage: bigProgressPct,
    hasLiveSpeed: Boolean(heroSpeedLabel),
  });

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
    <div className="relative flex h-full flex-col overflow-hidden">
      {d.replaceDialogOpen && d.replaceDialogMatch && (
        <DuplicateDownloadDialog
          open
          videoTitle={d.replaceDialogMatch.file.name ?? d.videoInfo?.title}
          match={d.replaceDialogMatch}
          onChoose={d.handleDuplicateChoice}
        />
      )}
      {d.heroBackdropThumb.trim() && !d.metadataLoading ? (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={d.heroBackdropThumb.trim()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1], delay: 0.12 }}
              className="absolute inset-0"
            >
              <img
                src={d.heroBackdropThumb.trim()}
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
          {d.showYtdlpStrip && (!d.anyDownloading || d.ytdlpUpdating) && (
            <YtdlpUpdateBanner
              key="ytdlp-update-strip"
              status={d.ytdlpUpdateStatus}
              percent={d.ytdlpUpdatePercent}
              updating={d.ytdlpUpdating}
              done={d.ytdlpUpdateJustFinished}
              invokeError={d.ytdlpUpdateInvokeError}
              onUpdate={() => void d.downloadYtdlpUpdateNow()}
              onDismiss={d.dismissYtdlpUpdateBanner}
            />
          )}
        </AnimatePresence>
        <div className="relative hidden min-h-[3.25rem] shrink-0 min-[800px]:block">
          <AnimatePresence initial={false}>
            {!d.anyDownloading && !d.url.startsWith("http") && !d.queueBrowsingHidesUrlChrome && (
              <motion.div
                key="browser-cookie-strip"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-x-0 top-0 mb-4 flex flex-col items-center gap-2 sm:mb-8 sm:gap-4"
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
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col justify-center gap-8 sm:gap-12">
          <LayoutGroup id="downloader-url">
            <AnimatePresence mode="sync" initial={false}>
              {d.showTopLeftDownloaderChrome && (
                <motion.div
                  key={d.showUrlBubble ? "url-pill" : "queue-add-tools"}
                  layoutId={d.showUrlBubble ? "downloader-url-chip" : undefined}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={d.urlChipLayoutTransition}
                  className="pointer-events-none absolute left-4 top-12 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col items-stretch gap-2 sm:left-6 sm:top-14 lg:left-8 lg:top-14"
                >
                  {d.showMainUrlChip && (
                    <DownloaderUrlChip
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
                    <QuickEnqueueButton
                      disabled={d.storageBlocksNewDownloads}
                      disabledReason={STORAGE_BLOCK_TIP}
                      onClick={() => void d.handleQuickEnqueueFromClipboard()}
                      className="self-start"
                    />
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
                  className="relative group mx-auto hidden w-full max-w-2xl px-4 pt-2 min-[700px]:block sm:pt-4"
                >
                  <AnimatePresence>
                    {!d.downloadStartPending &&
                      !d.showUrlBubble &&
                      d.urlSourceHint === "clipboard" &&
                      d.clipboardPastedHint && (
                      <motion.p
                        key="clipboard-pasted-hint"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        className="pb-3 text-center text-[9px] font-bold uppercase tracking-[0.22em] text-stone-500"
                      >
                        Pasted from clipboard
                      </motion.p>
                    )}
                    {!d.downloadStartPending &&
                      !d.showUrlBubble &&
                      d.urlSourceHint === "explorer" && (
                      <motion.p
                        key="explorer-added-hint"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        className="pb-3 text-center text-[9px] font-bold uppercase tracking-[0.22em] text-stone-500"
                      >
                        Added from watch page
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <AnimatePresence mode="wait" initial={false}>
                    {d.downloadStartPending ? (
                      <motion.p
                        key="starting-soon"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        className="w-full text-center text-lg font-black uppercase tracking-[0.18em] text-stone-100 sm:text-xl"
                        aria-live="polite"
                      >
                        <span className="inline-flex items-baseline gap-0.5">
                          Starting soon
                          <motion.span
                            aria-hidden
                            className="inline-flex gap-0.5"
                            initial="rest"
                            animate="pulse"
                          >
                            {[0, 1, 2].map((i) => (
                              <motion.span
                                key={i}
                                className="inline-block"
                                variants={{
                                  rest: { opacity: 0.25 },
                                  pulse: { opacity: [0.25, 1, 0.25] },
                                }}
                                transition={{
                                  duration: 1.1,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                  delay: i * 0.18,
                                }}
                              >
                                .
                              </motion.span>
                            ))}
                          </motion.span>
                        </span>
                      </motion.p>
                    ) : (
                      <motion.div
                        key="url-field"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
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
                          placeholder="Paste link"
                          spellCheck={false}
                          autoCapitalize="off"
                          autoCorrect="off"
                          className={
                            d.url.trim()
                              ? "w-full border-none bg-transparent text-center text-sm font-semibold tracking-tight text-stone-100 outline-none transition-colors sm:text-base"
                              : "w-full border-none bg-transparent text-center text-lg font-black uppercase tracking-[0.18em] text-stone-100 outline-none transition-colors placeholder:text-stone-700 sm:text-xl"
                          }
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!d.downloadStartPending && d.clipboardOfferUrl && (
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-3 text-center">
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
                  <div className="mt-5 flex flex-col items-center gap-3">
                    <UrlInputPacer
                      expanded={d.isFocused || d.metadataLoading || d.downloadStartPending}
                      loading={d.metadataLoading || d.downloadStartPending}
                    />
                    <AnimatePresence initial={false}>
                      {d.metadataLoading && !d.downloadStartPending && (
                        <motion.p
                          key="url-fetch-status"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 2 }}
                          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                          className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500"
                          aria-live="polite"
                        >
                          Fetching details…
                        </motion.p>
                      )}
                    </AnimatePresence>
                    {d.downloadStartPending ? (
                      <button
                        type="button"
                        onClick={d.handleStopActiveDownload}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-stone-500 transition-colors hover:text-stone-200"
                      >
                        <Ban size={12} strokeWidth={2.5} aria-hidden />
                        Cancel
                      </button>
                    ) : null}
                  </div>
                  {d.metadataError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative z-50 pt-4 text-center"
                    >
                      <span className="inline-block max-w-lg truncate rounded-full border border-red-400/10 bg-red-400/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-red-400">
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
                      <QuickEnqueueButton
                        disabled={d.storageBlocksNewDownloads}
                        disabledReason={STORAGE_BLOCK_TIP}
                        onClick={() => void d.handleQuickEnqueueFromClipboard()}
                        alwaysOpen
                        className="mx-auto"
                      />
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
            <div className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-10">
              {!d.showImmersiveDownload ? (
                <div className="space-y-6 sm:space-y-10">
                  <AnimatePresence mode="sync" initial={false}>
                    {displayHero ? (
                      <motion.div
                        key="video-details"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                        className="space-y-4 text-center sm:space-y-7"
                      >
                        {displayHero.title.trim() &&
                        !(
                          displayHero.loading &&
                          (d.metadataLoading || d.downloadStartPending) &&
                          !d.showUrlBubble &&
                          !d.anyDownloading &&
                          !d.queueBrowsingHidesUrlChrome
                        ) ? (
                          <h2
                            className={
                              displayHero.loading
                                ? "line-clamp-2 px-4 text-sm font-bold uppercase tracking-[0.18em] text-stone-500 sm:text-base"
                                : "line-clamp-2 px-4 pb-[0.18em] text-xl font-black leading-[1.12] tracking-tighter text-white sm:text-4xl sm:leading-[1.12] lg:text-6xl"
                            }
                          >
                            {displayHero.title}
                          </h2>
                        ) : null}
                        {!displayHero.loading && (
                          <HeroStats
                            duration={displayHero.duration}
                            bytes={
                              displayHero.isPlaylist && displayHeroBytes != null
                                ? displayHeroBytes
                                : displayHero.fileSizeBytes
                            }
                            isPlaylist={!!displayHero.isPlaylist}
                            videoCount={displayHero.playlistItems?.length ?? 0}
                          />
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
                        <motion.div className="space-y-4 pt-4 sm:space-y-5 sm:pt-8">
                          {!displayHero.loading &&
                            d.settings.downloadSubtitles &&
                            d.subLangsForDisplay && (
                            <p className="text-center text-[10px] font-black uppercase tracking-[0.25em] text-stone-500">
                              Captions
                              <span className="mx-2 text-stone-500">·</span>
                              <span className="text-stone-300">
                                {downloadSubtitleLangLabel(d.subLangsForDisplay)}
                              </span>
                            </p>
                          )}
                          {(d.showHeroAudioToggle || d.showPrimaryDownload) && (
                            <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
                              {d.showHeroAudioToggle && (
                                <HeroFormatSwitch
                                  audioOnly={d.heroAudioOnly}
                                  onToggle={d.toggleHeroAudio}
                                />
                              )}
                              {d.showPrimaryDownload && (
                                <button
                                  type="button"
                                  disabled={d.storageBlocksNewDownloads || d.downloadStartPending}
                                  data-tooltip={
                                    d.storageBlocksNewDownloads
                                      ? STORAGE_BLOCK_TIP
                                      : d.downloadStartPending
                                        ? "Download will start when details are ready"
                                        : undefined
                                  }
                                  onClick={d.handleDownloadClick}
                                  className={`flex items-center gap-3 rounded-xl bg-[color:var(--accent)] px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.35em] text-stone-950 transition-all duration-300 hover:scale-[1.03] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-[color:var(--accent)] sm:gap-4 sm:px-12 sm:py-4 sm:text-xs ${
                                    d.downloadStartPending ? "animate-pulse" : ""
                                  }`}
                                >
                                  <Download size={14} />
                                  {d.downloadStartPending ? "Starting soon…" : "Download"}
                                </button>
                              )}
                            </div>
                          )}
                          {d.focusedJob?.status === "queued" && d.focusedJob.storageBlock && (
                            <StorageBlockNote job={d.focusedJob} className="mt-4 justify-center" />
                          )}
                        </motion.div>
                        {displayHero.isPlaylist && displayHero.playlistItems && (
                          <PlaylistPreviewList
                            items={displayHero.playlistItems}
                            itemKey={d.playlistItemKey}
                            onReorder={d.reorderPlaylistItems}
                            disabled={!!d.batchQueuePlaylistView}
                            className="mx-auto mt-6 hidden h-[100px] max-w-4xl grid-cols-1 content-start gap-1 overflow-y-auto px-4 lg:grid-cols-2 pb-8 [mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)] min-[750px]:grid sm:mt-10 sm:h-[300px] rf-scrollbar"
                            renderRow={(item, idx, lifted) => {
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
                              return (
                                <PlaylistPreviewRow
                                  index={idx + 1}
                                  key={`playlist-row-${idx}-${item.webpageUrl ?? item.title}`}
                                  lifted={lifted}
                                  item={item}
                                  audioOnly={rowAudio}
                                  duplicate={dup}
                                  batchJob={batchJob}
                                  onToggleAudio={() =>
                                    batchJob
                                      ? d.toggleBatchQueueJobAudio(batchJob.id, !rowAudio)
                                      : d.togglePlaylistItemAudio(rowKey, !rowAudio)
                                  }
                                />
                              );
                            }}
                          />
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div className="relative flex h-full flex-col items-center justify-center">
                  {!isMultiItemDownload ? (
                    <ImmersiveDownloadHero
                      title={immersiveTitle}
                      thumbnail={d.heroBackdropThumb}
                      percentage={bigProgressPct}
                      speedLabel={heroSpeedLabel}
                      eta={d.progress?.eta}
                      phase={immersivePhase}
                      onStop={d.handleStopActiveDownload}
                    />
                  ) : null}
                  {isMultiItemDownload && downloadCarouselItems ? (
                    <div className="flex w-full flex-col items-center gap-5 px-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                        {immersivePhase === "preparing"
                          ? "Preparing download"
                          : immersivePhase === "finishing"
                            ? "Finishing up"
                            : "Downloading"}
                      </p>
                      <div data-downloader-hero-thumb className="w-full max-w-4xl">
                        <MultiDownloadSlotCarousel
                          items={downloadCarouselItems}
                          currentIndex={downloadCarouselCurrentIndex}
                          percentage={
                            immersivePhase === "preparing"
                              ? 0
                              : d.progress?.percentage || 0
                          }
                          speedLabel={
                            immersivePhase === "downloading" ? heroSpeedLabel : null
                          }
                          currentTitle={multiDownloadTitle}
                        />
                      </div>
                      <div className="w-full max-w-sm">
                        <div
                          className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={
                            immersivePhase === "downloading"
                              ? Math.round(bigProgressPct)
                              : undefined
                          }
                          aria-busy={immersivePhase !== "downloading"}
                        >
                          {immersivePhase === "downloading" ? (
                            <motion.div
                              className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--accent)]"
                              initial={false}
                              animate={{ width: `${bigProgressPct}%` }}
                              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                            />
                          ) : null}
                          {immersivePhase === "downloading" && bigProgressPct >= 2 ? (
                            <ProgressBarStreak pct={bigProgressPct} />
                          ) : null}
                          {immersivePhase !== "downloading" ? (
                            <div
                              className={
                                immersivePhase === "finishing"
                                  ? "rf-download-progress-pulse absolute inset-y-0 left-0 right-0 rounded-full bg-[color:var(--accent)]"
                                  : "rf-download-progress-indeterminate absolute inset-y-0 rounded-full bg-[color:var(--accent)]"
                              }
                            />
                          ) : null}
                        </div>
                        <p className="mt-3 text-center text-sm font-medium text-stone-500">
                          {immersivePhase === "preparing"
                            ? "Connecting and starting the transfer. This can take a moment."
                            : immersivePhase === "finishing"
                              ? "Merging and writing the file. Progress may sit near the end."
                              : heroSpeedLabel
                                ? `${Math.round(bigProgressPct)}% · ${heroSpeedLabel}`
                                : `${Math.round(bigProgressPct)}%`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={d.handleStopActiveDownload}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-stone-500 transition-colors hover:text-stone-200"
                      >
                        <Ban size={12} strokeWidth={2.5} aria-hidden />
                        Stop download
                      </button>
                    </div>
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

import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import {
  Globe,
  Clock,
  Download,
  Info,
  HardDrive,
  List,
  Paperclip,
  Check,
  X,
} from "lucide-react";
import { DuplicateDownloadDialog } from "./DuplicateDownloadDialog";
import { downloadSubtitleLangLabel } from "../store/types";
import { formatApproxFileSize, formatDuration } from "./downloader/downloaderFormat";
import { BROWSER_OPTIONS } from "./downloader/downloaderConstants";
import {
  DownloadJobQueuePanel,
  DownloadQueueItem,
  UrlInputPacer,
} from "./downloader/DownloadJobQueuePanel";
import { useDownloaderView, type DownloaderViewProps } from "./downloader/useDownloaderView";

export const DownloaderView = (props: DownloaderViewProps) => {
  const d = useDownloaderView(props);
  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {d.replaceDialogOpen && d.replaceDialogMatch && (
        <DuplicateDownloadDialog
          open
          videoTitle={d.videoInfo?.title}
          match={d.replaceDialogMatch}
          onChoose={d.handleDuplicateChoice}
        />
      )}
      <AnimatePresence>
        {d.videoInfo && (
          <motion.div
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 z-0"
          >
            <img
              src={d.videoInfo.thumbnail}
              alt=""
              className="w-full h-full object-cover opacity-40 blur-[12px] saturate-[1.1]"
            />
            <motion.div className="absolute inset-0 bg-gradient-to-b from-[#1D1613]/80 via-transparent to-[#1D1613]" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10 h-full flex flex-col p-4 sm:p-10 lg:p-16">
        <AnimatePresence>
          {!d.downloading && !d.url.startsWith("http") && (
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
                      className={`w-1 h-1 rounded-full transition-all duration-300 ${d.settings.browserContext === opt.value ? "bg-[color:var(--accent)] scale-150" : "bg-stone-800 group-hover:bg-stone-600"}`}
                    />
                    <span
                      className={`text-[8px] font-black uppercase tracking-[0.3em] ${
                        d.settings.browserContext === opt.value
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
                {!d.settings.browserContext && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--accent),transparent_90%)] bg-[color-mix(in_srgb,var(--accent),transparent_95%)]"
                  >
                    <Info size={10} className="text-[color:var(--accent)] opacity-40" />
                    <span className="text-[7px] font-black text-[color:var(--accent)] opacity-30 uppercase tracking-[0.2em]">
                      Select a browser if you encounter errors
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
              {d.showUrlBubble && (
                <motion.div
                  key="url-pill"
                  layout
                  layoutId="downloader-url-chip"
                  transition={d.urlChipLayoutTransition}
                  className="pointer-events-none absolute left-4 top-4 z-[60] sm:left-6 sm:top-6 lg:left-8 lg:top-8"
                >
                  <div className="group/clip pointer-events-auto" onMouseLeave={d.handleUrlClipMouseLeave}>
                    <div className="inline-flex max-w-9 transition-[max-width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/clip:max-w-[min(360px,calc(100vw-3rem))]">
                      <motion.div className="flex h-9 min-w-9 items-center overflow-hidden rounded-lg border border-white/10 bg-[#271C18]/95 text-[#EDD79C]/85 shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-md">
                        <button
                          type="button"
                          onClick={() => void d.handleUrlClipCopy()}
                          className="flex h-9 w-9 shrink-0 items-center justify-center transition-colors"
                          title="Copy link"
                          aria-label="Copy link"
                        >
                          {d.urlBubbleCopied ? (
                            <Check size={14} strokeWidth={2.5} className="text-[color:var(--accent)]" />
                          ) : (
                            <Paperclip size={14} strokeWidth={2} />
                          )}
                        </button>
                        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[9px] font-bold uppercase tracking-widest text-[#EDD79C]/90 opacity-0 transition-[opacity,padding] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/clip:px-2 group-hover/clip:opacity-100">
                          {d.url}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            d.handleClearUrl();
                          }}
                          className="flex h-9 w-8 shrink-0 items-center justify-center text-[#EDD79C]/40 opacity-70 transition-[opacity,color] duration-300 hover:text-[#EDD79C] group-hover/clip:opacity-100"
                          title="Clear link"
                          aria-label="Clear link"
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
              {!d.showUrlBubble && !d.downloading && (
                <motion.div
                  key="url-input"
                  layout
                  layoutId="downloader-url-chip"
                  transition={d.urlChipLayoutTransition}
                  className="relative group mx-auto w-full max-w-2xl pt-2 sm:pt-6 hidden min-[700px]:block"
                >
                  <AnimatePresence>
                    {!d.showUrlBubble && d.clipboardPastedHint && (
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
                  </AnimatePresence>
                  <input
                    type="text"
                    value={d.url}
                    onChange={(e) => d.handleUrlChange(e.target.value)}
                    onFocus={d.handleUrlFocus}
                    onBlur={d.handleUrlBlur}
                    placeholder="PASTE LINK"
                    className="w-full bg-transparent text-center text-lg sm:text-xl font-black tracking-[0.2em] text-stone-100 placeholder:text-stone-800 outline-none border-none transition-all uppercase"
                  />
                  {d.clipboardOfferUrl && (
                    <div className="pt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-stone-500">
                        Clipboard has a YouTube link —
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
                    <UrlInputPacer expanded={d.isFocused} loading={d.metadataLoading} />
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
                </motion.div>
              )}
            </AnimatePresence>
            <div className="w-full max-w-6xl mx-auto space-y-2 sm:space-y-8">
              {!d.downloading ? (
                <div className="space-y-4 sm:space-y-10">
                  <AnimatePresence mode="wait">
                    {d.videoInfo && !d.metadataLoading ? (
                      <motion.div
                        key="video-details"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                        className="text-center space-y-2 sm:space-y-6"
                      >
                        <h2 className="text-xl sm:text-4xl lg:text-6xl font-black text-white leading-[0.9] tracking-tighter line-clamp-2 px-4 max-h-[1.8em] overflow-hidden">
                          {d.videoInfo.title}
                        </h2>
                        <div className="hidden min-[600px]:flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-8 gap-y-2 text-[10px] font-black uppercase tracking-[0.3em] text-[color:var(--accent)] opacity-60">
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} className="opacity-50" />
                            <span>{formatDuration(d.videoInfo.duration)}</span>
                          </div>
                          {d.videoInfo.fileSizeBytes != null && d.videoInfo.fileSizeBytes > 0 && (
                            <div className="flex items-center gap-1.5">
                              <HardDrive size={12} className="opacity-50" />
                              <span title="Approximate size">~{formatApproxFileSize(d.videoInfo.fileSizeBytes)}</span>
                            </div>
                          )}
                          {d.videoInfo.isPlaylist && (
                            <div className="flex items-center gap-1.5">
                              <List size={12} className="opacity-50" />
                              <span>{d.videoInfo.playlistItems?.length || 0} Videos</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Globe size={12} className="opacity-50" />
                            <span>YouTube</span>
                          </div>
                        </div>
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
                              This video has been detected in your collection. Use{" "}
                              <span className="text-[#EDD79C]/80">Download</span> to replace it or save a copy.
                            </p>
                          </motion.div>
                        )}
                        <motion.div className="space-y-4 pt-2 sm:space-y-5 sm:pt-6">
                          {d.settings.downloadSubtitles && d.subLangsForDisplay && (
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="text-[8px] font-black uppercase tracking-[0.4em] text-stone-600">
                                Enqueued Captions
                              </span>
                              <p className="text-center text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                                {downloadSubtitleLangLabel(d.subLangsForDisplay)}
                              </p>
                            </div>
                          )}
                          <button
                            onClick={d.handleDownloadClick}
                            className="mx-auto flex items-center gap-3 rounded-full bg-[color:var(--accent)] px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.4em] text-stone-950 shadow-xl transition-all duration-300 hover:scale-105 hover:bg-white sm:gap-4 sm:px-12 sm:py-4 sm:text-xs"
                          >
                            <Download size={14} />
                            Download
                          </button>
                        </motion.div>
                        {d.videoInfo.isPlaylist && d.videoInfo.playlistItems && (
                          <div className="max-w-xl mx-auto mt-4 sm:mt-8 pt-4 sm:pt-8 border-t border-white/5 h-[100px] sm:h-[250px] overflow-y-auto scrollbar-none space-y-1.5 hidden min-[750px]:block">
                            {d.videoInfo.playlistItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                              >
                                <div className="w-24 aspect-video rounded-lg overflow-hidden bg-stone-900 flex-shrink-0">
                                  <img
                                    src={item.thumbnail}
                                    alt=""
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                  />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <h4 className="text-[11px] font-black uppercase tracking-widest text-stone-400 group-hover:text-white truncate">
                                    {item.title}
                                  </h4>
                                  <span className="text-[10px] font-mono text-stone-600 mt-1 block">
                                    {formatDuration(item.duration)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div className="relative h-full flex flex-col justify-center items-center">
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="absolute top-0 right-0 text-right space-y-6"
                  >
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-stone-600 uppercase tracking-[0.4em] mb-2">
                        Progress
                      </span>
                      <p className="text-3xl font-black text-white font-mono tracking-tighter leading-none">
                        {d.progress?.percentage.toFixed(0) || 0}
                        <span className="text-[color:var(--accent)] opacity-40 ml-0.5">%</span>
                      </p>
                    </div>
                    {d.progress?.currentIndex !== undefined && d.progress?.totalItems !== undefined && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-stone-600 uppercase tracking-[0.4em] mb-2">
                          Item
                        </span>
                        <p className="text-xl font-black text-[color:var(--accent)] font-mono tracking-tighter leading-none">
                          {d.progress.currentIndex + 1} / {d.progress.totalItems}
                        </p>
                      </div>
                    )}
                  </motion.div>
                  <div className="w-full flex flex-col items-center">
                    <div className="w-full max-w-4xl space-y-16 mb-20">
                      <div className="space-y-8">
                        <motion.h3
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-4xl lg:text-7xl font-black text-white uppercase tracking-tighter line-clamp-2 text-center leading-[0.9] drop-shadow-2xl"
                        >
                          {d.progress?.currentItemTitle || d.videoInfo?.title}
                        </motion.h3>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-[11px] font-black text-[color:var(--accent)] uppercase tracking-[1em] text-center ml-[1em] opacity-60"
                        >
                          {d.videoInfo?.isPlaylist ? "Downloading Collection" : "Downloading Media"}
                        </motion.p>
                      </div>
                      <div className="flex gap-2 w-full max-w-2xl mx-auto h-1 px-12">
                        {[...Array(40)].map((_, i) => (
                          <div key={i} className="flex-1 bg-white/[0.04] rounded-full overflow-hidden relative">
                            <motion.div
                              className="absolute inset-0 bg-[color:var(--accent)] shadow-[0_0_10px_var(--accent-glow)]"
                              initial={false}
                              animate={{
                                opacity: (d.progress?.percentage || 0) >= (i / 40) * 100 ? 1 : 0,
                                scaleY: (d.progress?.percentage || 0) >= (i / 40) * 100 ? 1 : 0.4,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    {d.videoInfo?.isPlaylist && d.videoInfo.playlistItems && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-screen max-w-7xl flex gap-8 overflow-x-auto scrollbar-none px-20 py-10"
                      >
                        {d.videoInfo.playlistItems.map((item, i) => (
                          <DownloadQueueItem
                            key={item.id}
                            item={item}
                            index={i}
                            currentIndex={d.progress?.currentIndex}
                            percentage={d.progress?.percentage || 0}
                          />
                        ))}
                      </motion.div>
                    )}
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-10 -right-10 flex items-center gap-10 text-right"
                  >
                    {d.progress?.speed && d.progress.speed !== "0 MB/S" && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-stone-600 uppercase tracking-[0.3em]">Speed</p>
                        <p className="text-xl font-black text-[color:var(--accent)] opacity-90 tabular-nums tracking-tighter">
                          {d.progress.speed}
                        </p>
                      </div>
                    )}
                    {d.progress?.eta && d.progress.eta !== "???" && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-stone-600 uppercase tracking-[0.3em]">Time</p>
                        <p className="text-xl font-black text-white tabular-nums tracking-tighter">{d.progress.eta}</p>
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </div>
          </LayoutGroup>
        </div>
        <DownloadJobQueuePanel />
      </div>
    </div>
  );
};

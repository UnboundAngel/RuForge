import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { buildDownloadJobOptions } from "../../downloadQueue";
import type { DownloadJobFinishedPayload } from "../../downloadQueue";
import { effectiveDownloadSubLangs } from "../../store/types";
import { readClipboardYouTubeUrl } from "../../downloaderClipboardYoutube";
import { findLibraryDuplicate, type DuplicateMatch } from "../../duplicateDownload";
import type { DuplicateDownloadChoice } from "../DuplicateDownloadDialog";
import {
  canonicalYouTubeWatchUrl,
  normalizeYouTubeUrlForCompare,
  playlistItemWatchUrl,
  youtubeUrlsMatch,
} from "../../youtubeUrl";
import {
  ProgressPayload,
  VideoInfo,
  type YtdlpUpdateDownloadProgressPayload,
  type YtdlpUpdateStatusPayload,
  normalizeProgressPayload,
} from "../../types";
import { URL_PACER_EASE } from "./downloaderConstants";

function urlConflictsWithActiveDownloader(
  targetUrl: string,
  mainFieldUrl: string,
  jobs: Array<{ url: string; status: string }>,
): boolean {
  if (youtubeUrlsMatch(mainFieldUrl.trim(), targetUrl)) return true;
  return jobs.some(
    (j) =>
      (j.status === "queued" || j.status === "downloading" || j.status === "paused") &&
      youtubeUrlsMatch(j.url, targetUrl),
  );
}

export type DownloaderViewProps = {
  internalDir: string;
  storageFull: boolean;
  onDownloadSuccess: () => void;
  onDownloadError: (msg: string) => void;
};

export function useDownloaderView({
  internalDir,
  storageFull,
  onDownloadSuccess,
  onDownloadError,
}: DownloaderViewProps) {
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const url = useRuforgeStore((s) => s.url);
  const setDownloaderUrl = useRuforgeStore((s) => s.setDownloaderUrl);
  const metadataLoading = useRuforgeStore((s) => s.metadataLoading);
  const setDownloaderMetadataLoading = useRuforgeStore((s) => s.setDownloaderMetadataLoading);
  const downloading = useRuforgeStore((s) => s.downloading);
  const progress = useRuforgeStore((s) => s.progress);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const applyDownloadProgress = useRuforgeStore((s) => s.applyDownloadProgress);
  const onDownloadJobFinished = useRuforgeStore((s) => s.onDownloadJobFinished);
  const onDownloadJobPaused = useRuforgeStore((s) => s.onDownloadJobPaused);
  const pumpDownloadQueue = useRuforgeStore((s) => s.pumpDownloadQueue);
  const videoInfo = useRuforgeStore((s) => s.videoInfo);
  const setVideoInfo = useRuforgeStore((s) => s.setVideoInfo);
  const metadataError = useRuforgeStore((s) => s.metadataError);
  const setMetadataError = useRuforgeStore((s) => s.setMetadataError);
  const isFocused = useRuforgeStore((s) => s.isFocused);
  const setDownloaderUrlFocused = useRuforgeStore((s) => s.setDownloaderUrlFocused);
  const invalidateEntries = useRuforgeStore((s) => s.invalidateEntries);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const entries = useRuforgeStore((s) => s.entries);
  const duplicateChoiceResolverRef = useRef<((choice: DuplicateDownloadChoice) => void) | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [replaceDialogMatch, setReplaceDialogMatch] = useState<DuplicateMatch | null>(null);
  const [quickEnqueueHint, setQuickEnqueueHint] = useState<
    null | "empty" | "conflict" | "library_skip"
  >(null);
  const [pinnedQuickEnqueueUrls, setPinnedQuickEnqueueUrls] = useState<string[]>([]);
  const [clipboardPastedHint, setClipboardPastedHint] = useState(false);
  const [clipboardOfferUrl, setClipboardOfferUrl] = useState<string | null>(null);
  const clipboardReadGenRef = useRef(0);
  const [urlBubbleCopied, setUrlBubbleCopied] = useState(false);
  const urlBubbleCopyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ytdlpUpdateDismissed, setYtdlpUpdateDismissed] = useState(false);
  const [ytdlpUpdateStatus, setYtdlpUpdateStatus] = useState<YtdlpUpdateStatusPayload | null>(null);
  const [ytdlpUpdateLoading, setYtdlpUpdateLoading] = useState(true);
  const [ytdlpUpdating, setYtdlpUpdating] = useState(false);
  const [ytdlpUpdatePercent, setYtdlpUpdatePercent] = useState<number | null>(null);
  const [ytdlpUpdateInvokeError, setYtdlpUpdateInvokeError] = useState<string | null>(null);
  const showYtdlpStrip = Boolean(
    !ytdlpUpdateDismissed &&
      !ytdlpUpdateLoading &&
      ytdlpUpdateStatus &&
      (ytdlpUpdateStatus.updateAvailable || ytdlpUpdating || Boolean(ytdlpUpdateInvokeError)),
  );
  const showUrlBubble = Boolean(videoInfo && !metadataLoading && !downloading && url.startsWith("http"));
  const libraryDuplicate = useMemo(() => {
    if (!url.startsWith("http")) return null;
    return findLibraryDuplicate(url, entries);
  }, [url, entries]);
  const showDuplicateBanner =
    Boolean(libraryDuplicate) &&
    Boolean(videoInfo) &&
    !metadataLoading &&
    !downloading &&
    !settings.skipDuplicatesAutomatically;
  const subLangsForDisplay = effectiveDownloadSubLangs(settings);
  const urlChipLayoutTransition = { layout: { duration: 0.55, ease: URL_PACER_EASE } } as const;

  useEffect(() => {
    const resolve = duplicateChoiceResolverRef.current;
    if (resolve) {
      duplicateChoiceResolverRef.current = null;
      resolve("cancel");
    }
    setReplaceDialogOpen(false);
    setReplaceDialogMatch(null);
  }, [url]);

  useEffect(() => {
    if (!quickEnqueueHint) return;
    const t = setTimeout(() => setQuickEnqueueHint(null), 2600);
    return () => clearTimeout(t);
  }, [quickEnqueueHint]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const run = async () => {
      setYtdlpUpdateLoading(true);
      try {
        const status = await invoke<YtdlpUpdateStatusPayload>("get_ytdlp_update_status");
        setYtdlpUpdateStatus(status);
      } catch {
        setYtdlpUpdateStatus(null);
      } finally {
        setYtdlpUpdateLoading(false);
      }

      unsub = await listen<YtdlpUpdateDownloadProgressPayload>(
        "ytdlp-update-download-progress",
        (event) => {
          const payload = event.payload;
          const phase = payload.phase;
          const p = typeof payload.percent === "number" ? payload.percent : null;

          if (phase === "downloading") setYtdlpUpdatePercent((prev) => p ?? prev);
          if (phase === "verifying") setYtdlpUpdatePercent(null);
          if (phase === "done") {
            setYtdlpUpdating(false);
            setYtdlpUpdatePercent(100);
            setTimeout(() => setYtdlpUpdatePercent(null), 900);
          }
        },
      );
    };
    void run();
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!url.startsWith("http")) return;
    if (entries.length > 0) return;
    void fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true });
  }, [url, entries.length, fetchEntries]);

  const handleBrowserChange = async (val: string) => {
    updateSetting("browserContext", val);
    if (val === "custom") {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (selected && typeof selected === "string") {
        updateSetting("cookieFile", selected);
      } else {
        updateSetting("browserContext", "");
      }
    }
  };

  const dismissYtdlpUpdateBanner = useCallback(() => {
    setYtdlpUpdateDismissed(true);
  }, []);

  const downloadYtdlpUpdateNow = useCallback(async () => {
    setYtdlpUpdateInvokeError(null);
    setYtdlpUpdating(true);
    setYtdlpUpdatePercent(null);
    try {
      await invoke("download_ytdlp_update");
      const status = await invoke<YtdlpUpdateStatusPayload>("get_ytdlp_update_status");
      setYtdlpUpdateStatus(status);
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : e instanceof Error && e.message
            ? e.message
            : "Could not download yt-dlp.";
      setYtdlpUpdateInvokeError(msg);
      setYtdlpUpdatePercent(null);
    } finally {
      setYtdlpUpdating(false);
    }
  }, []);

  const runDownload = useCallback(
    (
      targetUrl: string,
      choice: Exclude<DuplicateDownloadChoice, "cancel"> = "replace",
      meta?: { title?: string },
    ) => {
      const s = settingsRef.current;
      if (!targetUrl || (saveToInternal && storageFull)) return;
      const outputPath = saveToInternal ? internalDir : outputDir;
      const options = buildDownloadJobOptions(s, outputPath, choice);
      const st = useRuforgeStore.getState();
      const title =
        meta?.title ?? (youtubeUrlsMatch(targetUrl, st.url) ? st.videoInfo?.title : undefined);
      enqueueDownload(targetUrl, options, title ? { title } : undefined);
    },
    [saveToInternal, storageFull, outputDir, internalDir, enqueueDownload],
  );

  const promptDuplicateChoice = useCallback((match: DuplicateMatch) => {
    return new Promise<DuplicateDownloadChoice>((resolve) => {
      duplicateChoiceResolverRef.current = resolve;
      setReplaceDialogMatch(match);
      setReplaceDialogOpen(true);
    });
  }, []);

  const resolveDuplicate = useCallback(
    async (targetUrl: string): Promise<DuplicateMatch | null> => {
      let list = useRuforgeStore.getState().entries;
      if (list.length === 0) {
        await fetchEntries({ manageLoadingStart: false, skipPosterBackfill: true });
        list = useRuforgeStore.getState().entries;
      }
      return findLibraryDuplicate(targetUrl, list);
    },
    [fetchEntries],
  );

  const handleDownloadClick = useCallback(async () => {
    if (!url || (saveToInternal && storageFull)) return;

    const vi = useRuforgeStore.getState().videoInfo;
    const playlistItems = vi?.isPlaylist ? vi.playlistItems : undefined;

    if (playlistItems && playlistItems.length > 0) {
      const pairs: { url: string; title: string }[] = [];
      const seen = new Set<string>();
      for (const item of playlistItems) {
        const u = playlistItemWatchUrl(item);
        if (!u) continue;
        const k = normalizeYouTubeUrlForCompare(u);
        if (seen.has(k)) continue;
        seen.add(k);
        pairs.push({ url: u, title: item.title });
      }

      if (pairs.length > 0) {
        let batchChoice: Exclude<DuplicateDownloadChoice, "cancel"> | null = null;

        for (const { url: videoUrl, title } of pairs) {
          const duplicate = await resolveDuplicate(videoUrl);
          if (!duplicate) {
            runDownload(videoUrl, batchChoice ?? "replace", { title });
            continue;
          }
          if (settingsRef.current.skipDuplicatesAutomatically) continue;

          if (batchChoice === null) {
            const choice = await promptDuplicateChoice(duplicate);
            if (choice === "cancel") return;
            batchChoice = choice;
          }
          runDownload(videoUrl, batchChoice, { title });
        }
        return;
      }
      /* No resolved watch URLs — fall through and enqueue the playlist URL once (yt-dlp). */
    }

    const duplicate = libraryDuplicate ?? (await resolveDuplicate(url));
    if (!duplicate) {
      runDownload(url);
      return;
    }
    if (settingsRef.current.skipDuplicatesAutomatically) return;

    const choice = await promptDuplicateChoice(duplicate);
    if (choice === "cancel") return;
    runDownload(url, choice);
  }, [
    url,
    libraryDuplicate,
    resolveDuplicate,
    runDownload,
    saveToInternal,
    storageFull,
    promptDuplicateChoice,
  ]);

  const insertPinnedQuickEnqueueUrl = useCallback((targetUrl: string) => {
    const canon = canonicalYouTubeWatchUrl(targetUrl) ?? targetUrl.trim();
    setPinnedQuickEnqueueUrls((prev) => {
      if (prev.some((x) => youtubeUrlsMatch(x, canon))) return prev;
      return [canon, ...prev];
    });
  }, []);

  const removePinnedQuickEnqueueUrl = useCallback((targetUrl: string) => {
    setPinnedQuickEnqueueUrls((prev) => prev.filter((x) => !youtubeUrlsMatch(x, targetUrl)));
  }, []);

  const copyUrlToClipboard = useCallback(async (targetUrl: string) => {
    try {
      await writeText(targetUrl);
    } catch {
      try {
        await navigator.clipboard.writeText(targetUrl);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleDuplicateChoice = useCallback((choice: DuplicateDownloadChoice) => {
    const resolve = duplicateChoiceResolverRef.current;
    duplicateChoiceResolverRef.current = null;
    setReplaceDialogOpen(false);
    setReplaceDialogMatch(null);
    if (resolve) {
      resolve(choice);
    }
  }, []);

  const handleQuickEnqueueFromClipboard = useCallback(async () => {
    if (saveToInternal && storageFull) return;

    const clipUrl = await readClipboardYouTubeUrl();
    if (!clipUrl) {
      setQuickEnqueueHint("empty");
      return;
    }
    const st = useRuforgeStore.getState();
    if (urlConflictsWithActiveDownloader(clipUrl, st.url, st.downloadJobs)) {
      setQuickEnqueueHint("conflict");
      return;
    }

    const duplicate = await resolveDuplicate(clipUrl);
    if (!duplicate) {
      runDownload(clipUrl);
      insertPinnedQuickEnqueueUrl(clipUrl);
      setQuickEnqueueHint(null);
      return;
    }
    if (settingsRef.current.skipDuplicatesAutomatically) {
      setQuickEnqueueHint("library_skip");
      return;
    }

    const choice = await promptDuplicateChoice(duplicate);
    if (choice === "cancel") return;
    runDownload(clipUrl, choice);
    insertPinnedQuickEnqueueUrl(clipUrl);
    setQuickEnqueueHint(null);
  }, [
    saveToInternal,
    storageFull,
    resolveDuplicate,
    runDownload,
    promptDuplicateChoice,
    insertPinnedQuickEnqueueUrl,
  ]);

  const requestDownload = useCallback(
    async (targetUrl: string) => {
      if (!targetUrl || (saveToInternal && storageFull)) return;
      const duplicate = await resolveDuplicate(targetUrl);
      if (!duplicate) {
        void runDownload(targetUrl);
        return;
      }
      if (settingsRef.current.skipDuplicatesAutomatically) return;
      setDownloaderUrl(targetUrl);
    },
    [resolveDuplicate, runDownload, saveToInternal, storageFull, setDownloaderUrl],
  );

  const requestDownloadRef = useRef(requestDownload);
  requestDownloadRef.current = requestDownload;

  const handleUrlFocus = useCallback(() => {
    setDownloaderUrlFocused(true);
    const gen = ++clipboardReadGenRef.current;
    void (async () => {
      const clipUrl = await readClipboardYouTubeUrl();
      if (gen !== clipboardReadGenRef.current) return;
      if (!clipUrl) return;
      const currentUrl = useRuforgeStore.getState().url;
      if (youtubeUrlsMatch(currentUrl, clipUrl)) return;
      if (!currentUrl.trim()) {
        setDownloaderUrl(clipUrl);
        setClipboardPastedHint(true);
        setClipboardOfferUrl(null);
        return;
      }
      setClipboardOfferUrl(clipUrl);
    })();
  }, [setDownloaderUrl, setDownloaderUrlFocused]);

  const handleUrlBlur = useCallback(() => {
    clipboardReadGenRef.current += 1;
    setDownloaderUrlFocused(false);
    setClipboardOfferUrl(null);
  }, [setDownloaderUrlFocused]);

  const applyClipboardOffer = useCallback(() => {
    if (!clipboardOfferUrl) return;
    setDownloaderUrl(clipboardOfferUrl);
    setClipboardPastedHint(true);
    setClipboardOfferUrl(null);
  }, [clipboardOfferUrl, setDownloaderUrl]);

  const clearUrlBubbleCopied = useCallback(() => {
    setUrlBubbleCopied(false);
    if (urlBubbleCopyResetRef.current) {
      clearTimeout(urlBubbleCopyResetRef.current);
      urlBubbleCopyResetRef.current = null;
    }
  }, []);

  const handleUrlClipCopy = useCallback(async () => {
    if (!url) return;
    try {
      await writeText(url);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        return;
      }
    }
    setUrlBubbleCopied(true);
    if (urlBubbleCopyResetRef.current) clearTimeout(urlBubbleCopyResetRef.current);
    urlBubbleCopyResetRef.current = setTimeout(() => {
      setUrlBubbleCopied(false);
      urlBubbleCopyResetRef.current = null;
    }, 2000);
  }, [url]);

  const handleClearUrl = useCallback(() => {
    clipboardReadGenRef.current += 1;
    setDownloaderUrl("");
    setVideoInfo(null);
    setMetadataError(null);
    setDownloaderMetadataLoading(false);
    setClipboardPastedHint(false);
    setClipboardOfferUrl(null);
    clearUrlBubbleCopied();
    setQuickEnqueueHint(null);
    setPinnedQuickEnqueueUrls([]);
  }, [
    setDownloaderUrl,
    setVideoInfo,
    setMetadataError,
    setDownloaderMetadataLoading,
    clearUrlBubbleCopied,
  ]);

  useEffect(() => {
    if (!showUrlBubble) clearUrlBubbleCopied();
  }, [showUrlBubble, clearUrlBubbleCopied]);

  const handleUrlChange = useCallback(
    (value: string) => {
      setDownloaderUrl(value);
      setClipboardPastedHint(false);
      setClipboardOfferUrl(null);
    },
    [setDownloaderUrl],
  );

  useEffect(() => {
    pumpDownloadQueue();
  }, [pumpDownloadQueue]);

  useEffect(() => {
    const unlistenProgress = listen<ProgressPayload & { job_id?: string }>(
      "download-progress",
      (event) => {
        const normalized = normalizeProgressPayload(event.payload);
        if (!normalized) return;
        applyDownloadProgress(normalized);
      },
    );
    const unlistenFinished = listen<DownloadJobFinishedPayload>("download-job-finished", (event) => {
      onDownloadJobFinished(event.payload);
      if (event.payload.success) {
        void invalidateEntries({ silent: true }).then(() => {
          onDownloadSuccess();
        });
      } else {
        onDownloadError(event.payload.error ?? "Download failed");
      }
    });
    const unlistenPaused = listen<string>("download-job-paused", (event) => {
      onDownloadJobPaused(event.payload);
    });
    const unlistenManualTrigger = listen<string>("manual-download-trigger", (event) => {
      void requestDownloadRef.current(event.payload);
    });
    return () => {
      unlistenProgress.then((f) => f());
      unlistenFinished.then((f) => f());
      unlistenPaused.then((f) => f());
      unlistenManualTrigger.then((f) => f());
    };
  }, [
    applyDownloadProgress,
    onDownloadJobFinished,
    onDownloadJobPaused,
    invalidateEntries,
    onDownloadSuccess,
    onDownloadError,
  ]);

  useEffect(() => {
    let active = true;
    setMetadataError(null);
    if (url.startsWith("http")) {
      const fetchInfo = async () => {
        setDownloaderMetadataLoading(true);
        try {
          const info = await invoke<VideoInfo>("get_video_info", { url });
          if (active) {
            setVideoInfo(info);
            setMetadataError(null);
          }
        } catch (e: unknown) {
          console.error(`[RuForge] get_video_info failed: ${e}`);
          if (active) {
            setVideoInfo(null);
            setMetadataError(String(e));
          }
        } finally {
          if (active) setDownloaderMetadataLoading(false);
        }
      };
      const timeoutId = setTimeout(fetchInfo, 500);
      return () => {
        active = false;
        clearTimeout(timeoutId);
      };
    }
    setVideoInfo(null);
  }, [url, setMetadataError, setDownloaderMetadataLoading, setVideoInfo]);

  return {
    settings,
    url,
    metadataLoading,
    downloading,
    progress,
    videoInfo,
    metadataError,
    isFocused,
    replaceDialogOpen,
    replaceDialogMatch,
    clipboardPastedHint,
    clipboardOfferUrl,
    urlBubbleCopied,
    showUrlBubble,
    showDuplicateBanner,
    subLangsForDisplay,
    urlChipLayoutTransition,
    handleBrowserChange,
    handleDownloadClick: () => void handleDownloadClick(),
    handleDuplicateChoice,
    handleUrlFocus,
    handleUrlBlur,
    applyClipboardOffer,
    handleUrlClipCopy,
    handleClearUrl,
    handleUrlChange,
    quickEnqueueHint,
    pinnedQuickEnqueueUrls,
    removePinnedQuickEnqueueUrl,
    copyUrlToClipboard,
    handleQuickEnqueueFromClipboard,
    showYtdlpStrip,
    ytdlpUpdateStatus,
    ytdlpUpdateLoading,
    ytdlpUpdating,
    ytdlpUpdatePercent,
    ytdlpUpdateInvokeError,
    dismissYtdlpUpdateBanner,
    downloadYtdlpUpdateNow,
  };
}

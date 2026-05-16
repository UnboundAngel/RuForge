import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useRuforgeStore } from "../../store/ruforgeStore";
import {
  buildDownloadJobOptions,
  downloadJobMediaNeedsHydration,
  videoInfoToDownloadJobSnapshot,
  type DownloadJobFinishedPayload,
} from "../../downloadQueue";
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
import { urlConflictsWithActiveDownloader } from "./downloaderUrlConflict";
import {
  type YoutubeUrlDropHandler,
  setYoutubeUrlDropHandler,
} from "../../features/downloader/youtubeUrlDropRegistry";

const STORAGE_FULL_NOTIFY =
  "Library storage limit reached. Free space in Settings or switch to an external download folder.";

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
  const notify = useRuforgeStore((s) => s.notify);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const url = useRuforgeStore((s) => s.url);
  const setDownloaderUrl = useRuforgeStore((s) => s.setDownloaderUrl);
  const metadataLoading = useRuforgeStore((s) => s.metadataLoading);
  const setDownloaderMetadataLoading = useRuforgeStore((s) => s.setDownloaderMetadataLoading);
  const setDownloaderDuplicateDialogOpenInStore = useRuforgeStore(
    (s) => s.setDownloaderDuplicateDialogOpen,
  );
  const progress = useRuforgeStore((s) => s.progress);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const confirmPendingDownloadJob = useRuforgeStore((s) => s.confirmPendingDownloadJob);
  const setDownloaderFocusedJobId = useRuforgeStore((s) => s.setDownloaderFocusedJobId);
  const applyDownloadProgress = useRuforgeStore((s) => s.applyDownloadProgress);
  const onDownloadJobFinished = useRuforgeStore((s) => s.onDownloadJobFinished);
  const onDownloadJobPaused = useRuforgeStore((s) => s.onDownloadJobPaused);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const queueHydrateOrphanMetadata = useRuforgeStore((s) => s.queueHydrateOrphanMetadata);
  const pumpDownloadQueue = useRuforgeStore((s) => s.pumpDownloadQueue);
  const releaseHeldDownloadJobs = useRuforgeStore((s) => s.releaseHeldDownloadJobs);
  const videoInfo = useRuforgeStore((s) => s.videoInfo);
  const setVideoInfo = useRuforgeStore((s) => s.setVideoInfo);
  const metadataError = useRuforgeStore((s) => s.metadataError);
  const setMetadataError = useRuforgeStore((s) => s.setMetadataError);
  const isFocused = useRuforgeStore((s) => s.isFocused);
  const setDownloaderUrlFocused = useRuforgeStore((s) => s.setDownloaderUrlFocused);
  const invalidateEntries = useRuforgeStore((s) => s.invalidateEntries);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const entries = useRuforgeStore((s) => s.entries);
  const downloadQueueBusy = useRuforgeStore((s) =>
    s.downloadJobs.some(
      (j) =>
        j.status === "queued" ||
        j.status === "downloading" ||
        j.status === "paused",
    ),
  );
  const anyDownloading = useRuforgeStore((s) =>
    s.downloadJobs.some((j) => j.status === "downloading"),
  );
  const focusedJobId = useRuforgeStore((s) => s.focusedJobId);
  const focusedJob = useRuforgeStore((s) => {
    if (!s.focusedJobId) return null;
    return s.downloadJobs.find((j) => j.id === s.focusedJobId) ?? null;
  });
  const focusShowsBigProgress = focusedJob?.status === "downloading";
  const duplicateChoiceResolverRef = useRef<((choice: DuplicateDownloadChoice) => void) | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [replaceDialogMatch, setReplaceDialogMatch] = useState<DuplicateMatch | null>(null);
  const storageBlocksNewDownloads = saveToInternal && storageFull;
  const [quickEnqueueHint, setQuickEnqueueHint] = useState<
    null | "empty" | "conflict" | "library_skip" | "storage_full" | "wait_metadata"
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
  const showUrlBubble = useMemo(
    () =>
      Boolean(
        videoInfo &&
          !metadataLoading &&
          !anyDownloading &&
          url.startsWith("http") &&
          !(focusedJobId && focusedJob && !youtubeUrlsMatch(url, focusedJob.url)),
      ),
    [videoInfo, metadataLoading, anyDownloading, url, focusedJobId, focusedJob],
  );

  /** Hide URL bar / browser strip when browsing a queue row that is not the hero URL field. */
  const queueBrowsingHidesUrlChrome = useMemo(
    () =>
      Boolean(
        focusedJobId &&
          focusedJob &&
          downloadJobs.length > 0 &&
          (!url.trim() || !youtubeUrlsMatch(url, focusedJob.url)),
      ),
    [focusedJobId, focusedJob, url, downloadJobs.length],
  );

  const hasQueuedOrPausedJobs = useMemo(
    () =>
      downloadJobs.some((j) => j.status === "queued" || j.status === "paused"),
    [downloadJobs],
  );

  /**
   * Top-left paperclip / pinned chips / "Queue another" — not only when `showUrlBubble`
   * (needs hero `videoInfo`), but also after refresh with an empty bar and a restored queue.
   */
  const showQueueAddToolbar = useMemo(
    () => Boolean(!anyDownloading && (url.startsWith("http") || hasQueuedOrPausedJobs)),
    [anyDownloading, url, hasQueuedOrPausedJobs],
  );

  const showTopLeftDownloaderChrome = useMemo(
    () => Boolean(showUrlBubble || showQueueAddToolbar),
    [showUrlBubble, showQueueAddToolbar],
  );

  const libraryDuplicate = useMemo(() => {
    if (!url.startsWith("http")) return null;
    return findLibraryDuplicate(url, entries);
  }, [url, entries]);
  const showDuplicateBanner =
    Boolean(libraryDuplicate) &&
    Boolean(videoInfo) &&
    !metadataLoading &&
    !downloadQueueBusy &&
    !settings.skipDuplicatesAutomatically;
  const subLangsForDisplay = effectiveDownloadSubLangs(settings);
  const urlChipLayoutTransition = { layout: { duration: 0.55, ease: URL_PACER_EASE } } as const;

  const heroBackdropThumb = useMemo(() => {
    const fromJob = focusedJob?.metadata?.thumbnail?.trim();
    if (fromJob) return fromJob;
    if (!focusedJob && videoInfo?.thumbnail) return videoInfo.thumbnail.trim();
    return "";
  }, [focusedJob, videoInfo]);

  /** Mirrors `handleDownloadClick`: queue-row target uses row metadata hydration; divergent bar URL uses hero `videoInfo`. */
  const showPrimaryDownload = useMemo(() => {
    if (metadataLoading) return false;
    if (focusShowsBigProgress) return false;
    if (!focusedJob) {
      return Boolean(videoInfo && url.startsWith("http"));
    }
    const barTrimmed = url.trim();
    const queueRowIsDownloadTarget =
      !barTrimmed || youtubeUrlsMatch(url, focusedJob.url);
    if (queueRowIsDownloadTarget) {
      return !downloadJobMediaNeedsHydration(focusedJob.metadata);
    }
    return Boolean(videoInfo && url.startsWith("http"));
  }, [videoInfo, metadataLoading, focusedJob, url, focusShowsBigProgress]);

  useEffect(() => {
    queueHydrateOrphanMetadata();
  }, [queueHydrateOrphanMetadata]);

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
    let disposed = false;
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

      const un = await listen<YtdlpUpdateDownloadProgressPayload>(
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
      if (disposed) {
        un();
        return;
      }
      unsub = un;
    };
    void run();
    return () => {
      disposed = true;
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

  const enqueueDownloadOnly = useCallback(
    (
      targetUrl: string,
      choice: Exclude<DuplicateDownloadChoice, "cancel"> = "replace",
      meta?: { title?: string; approval: "auto" | "pending" | "held" },
    ) => {
      const s = settingsRef.current;
      if (!targetUrl || storageBlocksNewDownloads) return;
      const outputPath = saveToInternal ? internalDir : outputDir;
      const options = buildDownloadJobOptions(s, outputPath, choice);
      const st = useRuforgeStore.getState();
      let snapshot =
        youtubeUrlsMatch(targetUrl, st.url) && st.videoInfo
          ? videoInfoToDownloadJobSnapshot(st.videoInfo)
          : undefined;
      const batchTitle = meta?.title?.trim();
      if (!snapshot && batchTitle) {
        snapshot = {
          title: batchTitle,
          thumbnail: "",
          duration: 0,
          isPlaylist: false,
        };
      }
      const approval = meta?.approval ?? "auto";
      enqueueDownload(targetUrl, options, {
        snapshot,
        title: meta?.title,
        approval,
      });
    },
    [storageBlocksNewDownloads, outputDir, internalDir, enqueueDownload],
  );

  /** Turn the hero URL bar into a queued job when adding another URL, so the first link is not lost. */
  const promoteStagedBarToDownloadQueue = useCallback(() => {
    const st = useRuforgeStore.getState();
    const staged = st.url.trim();
    if (!staged.startsWith("http")) return;
    if (st.downloadJobs.some((j) => youtubeUrlsMatch(j.url, staged))) return;
    const dupLib = findLibraryDuplicate(staged, st.entries);
    if (dupLib && settingsRef.current.skipDuplicatesAutomatically) return;
    if (!st.videoInfo || st.metadataLoading) {
      setQuickEnqueueHint("wait_metadata");
      return;
    }
    enqueueDownloadOnly(staged, "replace", { approval: "held" });
  }, [enqueueDownloadOnly, setQuickEnqueueHint]);

  const runDownload = useCallback(
    (
      targetUrl: string,
      choice: Exclude<DuplicateDownloadChoice, "cancel"> = "replace",
      meta?: { title?: string },
    ) => {
      enqueueDownloadOnly(targetUrl, choice, { title: meta?.title, approval: "auto" });
    },
    [enqueueDownloadOnly],
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
    if (storageBlocksNewDownloads) {
      notify(STORAGE_FULL_NOTIFY, "warning");
      return;
    }

    const st0 = useRuforgeStore.getState();
    const barUrl = st0.url.trim();
    const focused = st0.focusedJobId
      ? st0.downloadJobs.find((j) => j.id === st0.focusedJobId)
      : null;
    const effectiveUrl = barUrl || focused?.url?.trim() || "";
    if (!effectiveUrl) return;

    const vi = st0.videoInfo;
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
        releaseHeldDownloadJobs();
        pumpDownloadQueue();
        return;
      }
      /* No resolved watch URLs — fall through and enqueue the playlist URL once (yt-dlp). */
    }

    const duplicate =
      (barUrl && libraryDuplicate && youtubeUrlsMatch(barUrl, effectiveUrl)
        ? libraryDuplicate
        : null) ?? (await resolveDuplicate(effectiveUrl));
    const heroAlreadyQueued = () =>
      useRuforgeStore.getState().downloadJobs.some(
        (j) => j.status === "queued" && youtubeUrlsMatch(j.url, effectiveUrl),
      );

    if (!duplicate) {
      releaseHeldDownloadJobs();
      if (!heroAlreadyQueued()) runDownload(effectiveUrl);
      pumpDownloadQueue();
      return;
    }
    if (settingsRef.current.skipDuplicatesAutomatically) return;

    const choice = await promptDuplicateChoice(duplicate);
    if (choice === "cancel") return;
    releaseHeldDownloadJobs();
    if (!heroAlreadyQueued()) runDownload(effectiveUrl, choice);
    pumpDownloadQueue();
  }, [
    url,
    focusedJobId,
    libraryDuplicate,
    resolveDuplicate,
    runDownload,
    pumpDownloadQueue,
    releaseHeldDownloadJobs,
    storageBlocksNewDownloads,
    notify,
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

  /** App.tsx switches `activeTab` before invoking (main-webview intake). */
  const handleDroppedYoutubeUrls = useCallback(
    async (urls: readonly string[]) => {
      if (urls.length === 0) return;
      if (storageBlocksNewDownloads) {
        notify(STORAGE_FULL_NOTIFY, "warning");
        return;
      }

      const st = useRuforgeStore.getState();
      const mainEmpty = !st.url.trim();

      const enqueueViaQuickPath = async (videoUrl: string) => {
        if (storageBlocksNewDownloads) return;

        const s2 = useRuforgeStore.getState();
        if (urlConflictsWithActiveDownloader(videoUrl, s2.url, s2.downloadJobs)) {
          setQuickEnqueueHint("conflict");
          return;
        }

        const duplicate = await resolveDuplicate(videoUrl);
        const approval = s2.downloadJobs.some((j) => j.status === "downloading")
          ? ("pending" as const)
          : ("held" as const);

        if (!duplicate) {
          enqueueDownloadOnly(videoUrl, "replace", { approval });
          insertPinnedQuickEnqueueUrl(videoUrl);
          return;
        }
        if (settingsRef.current.skipDuplicatesAutomatically) {
          setQuickEnqueueHint("library_skip");
          return;
        }

        const choice = await promptDuplicateChoice(duplicate);
        if (choice === "cancel") return;

        enqueueDownloadOnly(videoUrl, choice, { approval });
        insertPinnedQuickEnqueueUrl(videoUrl);
      };

      if (!mainEmpty) {
        promoteStagedBarToDownloadQueue();
      }

      if (mainEmpty) {
        const [first, ...rest] = urls as string[];
        setDownloaderUrl(first);
        for (const u of rest) {
          await enqueueViaQuickPath(u);
        }
      } else {
        for (const u of urls) {
          await enqueueViaQuickPath(u);
        }
      }
    },
    [
      storageBlocksNewDownloads,
      notify,
      setDownloaderUrl,
      resolveDuplicate,
      enqueueDownloadOnly,
      promptDuplicateChoice,
      insertPinnedQuickEnqueueUrl,
      promoteStagedBarToDownloadQueue,
    ],
  );

  useEffect(() => {
    const run: YoutubeUrlDropHandler = (urls) => {
      void handleDroppedYoutubeUrls(urls);
    };
    setYoutubeUrlDropHandler(run);
    return () => {
      setYoutubeUrlDropHandler(null);
    };
  }, [handleDroppedYoutubeUrls]);

  useEffect(() => {
    setDownloaderDuplicateDialogOpenInStore(replaceDialogOpen);
    return () => {
      setDownloaderDuplicateDialogOpenInStore(false);
    };
  }, [replaceDialogOpen, setDownloaderDuplicateDialogOpenInStore]);

  const handleQuickEnqueueFromClipboard = useCallback(async () => {
    if (storageBlocksNewDownloads) {
      setQuickEnqueueHint("storage_full");
      return;
    }

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

    promoteStagedBarToDownloadQueue();

    const duplicate = await resolveDuplicate(clipUrl);
    const st0 = useRuforgeStore.getState();
    const approval = st0.downloadJobs.some((j) => j.status === "downloading")
      ? ("pending" as const)
      : ("held" as const);

    if (!duplicate) {
      enqueueDownloadOnly(clipUrl, "replace", { approval });
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
    enqueueDownloadOnly(clipUrl, choice, { approval });
    insertPinnedQuickEnqueueUrl(clipUrl);
    setQuickEnqueueHint(null);
  }, [
    storageBlocksNewDownloads,
    resolveDuplicate,
    enqueueDownloadOnly,
    promptDuplicateChoice,
    insertPinnedQuickEnqueueUrl,
    promoteStagedBarToDownloadQueue,
  ]);

  const requestDownload = useCallback(
    async (targetUrl: string) => {
      if (!targetUrl) return;
      if (storageBlocksNewDownloads) {
        notify(STORAGE_FULL_NOTIFY, "warning");
        return;
      }
      const duplicate = await resolveDuplicate(targetUrl);
      if (!duplicate) {
        enqueueDownloadOnly(targetUrl, "replace", { approval: "auto" });
        pumpDownloadQueue();
        return;
      }
      if (settingsRef.current.skipDuplicatesAutomatically) return;
      setDownloaderUrl(targetUrl);
    },
    [
      resolveDuplicate,
      enqueueDownloadOnly,
      pumpDownloadQueue,
      storageBlocksNewDownloads,
      notify,
      setDownloaderUrl,
    ],
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
    setDownloaderFocusedJobId(null);
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
    setDownloaderFocusedJobId,
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
      const incoming = value.trim();
      const st0 = useRuforgeStore.getState();
      const prev = st0.url.trim();
      if (
        prev.startsWith("http") &&
        incoming.startsWith("http") &&
        !youtubeUrlsMatch(prev, incoming)
      ) {
        const alreadyQueued = st0.downloadJobs.some((j) => youtubeUrlsMatch(j.url, prev));
        const dupLib = findLibraryDuplicate(prev, st0.entries);
        const skipDup = dupLib && settingsRef.current.skipDuplicatesAutomatically;
        if (!alreadyQueued && !skipDup && st0.videoInfo && !st0.metadataLoading) {
          if (storageBlocksNewDownloads) {
            notify(STORAGE_FULL_NOTIFY, "warning");
          } else {
            enqueueDownloadOnly(prev, "replace", { approval: "held" });
          }
        }
      }
      setDownloaderUrl(value);
      setClipboardPastedHint(false);
      setClipboardOfferUrl(null);
    },
    [setDownloaderUrl, enqueueDownloadOnly, storageBlocksNewDownloads, notify],
  );

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
      setDownloaderMetadataLoading(true);
      const fetchInfo = async () => {
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
        setDownloaderMetadataLoading(false);
      };
    }
    setVideoInfo(null);
  }, [url, setMetadataError, setDownloaderMetadataLoading, setVideoInfo]);

  return {
    settings,
    url,
    metadataLoading,
    progress,
    videoInfo,
    focusedJob,
    focusedJobId,
    metadataError,
    isFocused,
    replaceDialogOpen,
    replaceDialogMatch,
    clipboardPastedHint,
    clipboardOfferUrl,
    urlBubbleCopied,
    showUrlBubble,
    showQueueAddToolbar,
    showTopLeftDownloaderChrome,
    showDuplicateBanner,
    queueBrowsingHidesUrlChrome,
    focusShowsBigProgress,
    anyDownloading,
    heroBackdropThumb,
    showPrimaryDownload,
    storageBlocksNewDownloads,
    setDownloaderFocusedJobId,
    confirmPendingDownloadJob,
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

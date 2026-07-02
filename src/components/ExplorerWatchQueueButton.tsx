import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  buildDownloadJobOptions,
  type DownloadJob,
} from "../downloadQueue";
import { findLibraryDuplicate } from "../duplicateDownload";
import { useRuforgeStore } from "../store/ruforgeStore";
import {
  canonicalYouTubeWatchUrl,
  isYouTubeDotComWatchPageUrl,
  youtubeUrlsMatch,
} from "../youtubeUrl";
import { WarningPlaylistIcon } from "./icons/WarningPlaylistIcon";
import {
  titlebarIconButtonClass,
  titlebarTooltipClassName,
} from "./TitlebarHoverButton";
import { deliverUserNotification } from "../systemNotify";

const STORAGE_FULL_NOTIFY =
  "Library storage limit reached. Free space in Settings or switch to an external download folder.";

const STORAGE_FULL_REASON = "Your storage is full";

const LEFT_HINT_MS = 1700;
const LEFT_HINT_LABEL = {
  storage: STORAGE_FULL_REASON,
  add: "Added to Download Queue",
  remove: "Removed from Download Queue",
} as const;

function explorerQueueTooltip(
  storageBlocks: boolean,
  inQueue: boolean,
  hovering: boolean,
): string {
  if (storageBlocks && !inQueue) return STORAGE_FULL_REASON;
  if (inQueue && hovering) return "Remove from download queue";
  if (inQueue) return "Queued - click to remove";
  return "Add this watch page to the download queue";
}

function pickActiveQueueJob(
  jobs: DownloadJob[],
  watchCanonical: string,
): DownloadJob | undefined {
  return jobs.find(
    (j) =>
      youtubeUrlsMatch(j.url, watchCanonical) &&
      (j.status === "queued" ||
        j.status === "paused" ||
        j.status === "downloading"),
  );
}

type ExplorerWatchQueueButtonProps = {
  storageBlocksNewDownloads: boolean;
};

/** Fixed slot so playlist / check / remove / warning all occupy the same footprint. */
const ICON_SLOT = "relative flex h-[18px] w-[18px] shrink-0 items-center justify-center";

export function ExplorerWatchQueueButton({
  storageBlocksNewDownloads,
}: ExplorerWatchQueueButtonProps) {
  const lastExplorerUrl = useRuforgeStore((s) => s.lastExplorerUrl);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const settings = useRuforgeStore((s) => s.settings);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const internalVault = useRuforgeStore((s) => s.internalVault);
  const entries = useRuforgeStore((s) => s.entries);
  const notify = useRuforgeStore((s) => s.notify);
  const enqueueDownload = useRuforgeStore((s) => s.enqueueDownload);
  const removeDownloadJob = useRuforgeStore((s) => s.removeDownloadJob);
  const setLastExplorerUrl = useRuforgeStore((s) => s.setLastExplorerUrl);

  const [hovering, setHovering] = useState(false);
  const [leftHint, setLeftHint] = useState<keyof typeof LEFT_HINT_LABEL | null>(
    null,
  );
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashLeftHint = useCallback((kind: keyof typeof LEFT_HINT_LABEL) => {
    if (hintTimerRef.current != null) {
      clearTimeout(hintTimerRef.current);
    }
    setLeftHint(kind);
    hintTimerRef.current = window.setTimeout(() => {
      setLeftHint(null);
      hintTimerRef.current = null;
    }, LEFT_HINT_MS);
  }, []);

  useEffect(
    () => () => {
      if (hintTimerRef.current != null) clearTimeout(hintTimerRef.current);
    },
    [],
  );

  const visible = isYouTubeDotComWatchPageUrl(lastExplorerUrl);
  const watchCanonical = useMemo(
    () => (visible ? canonicalYouTubeWatchUrl(lastExplorerUrl) : null),
    [lastExplorerUrl, visible],
  );

  const activeJob = useMemo(
    () =>
      watchCanonical
        ? pickActiveQueueJob(downloadJobs, watchCanonical)
        : undefined,
    [downloadJobs, watchCanonical],
  );
  const inQueue = Boolean(activeJob);

  const tooltip = explorerQueueTooltip(
    storageBlocksNewDownloads,
    inQueue,
    hovering,
  );

  const handleClick = useCallback(async () => {
    let pageUrl = lastExplorerUrl;
    try {
      pageUrl = await invoke<string>("get_embedded_explorer_webview_url");
      setLastExplorerUrl(pageUrl);
    } catch {
      pageUrl = lastExplorerUrl;
    }
    if (!isYouTubeDotComWatchPageUrl(pageUrl)) return;
    const canon = canonicalYouTubeWatchUrl(pageUrl);
    if (!canon) return;

    const jobs = useRuforgeStore.getState().downloadJobs;
    const job = pickActiveQueueJob(jobs, canon);
    if (job) {
      void removeDownloadJob(job.id);
      setHovering(false);
      flashLeftHint("remove");
      return;
    }
    if (storageBlocksNewDownloads) {
      flashLeftHint("storage");
      void deliverUserNotification(
        { dedupeKey: "storage-full", body: STORAGE_FULL_NOTIFY, kind: "warning" },
        notify,
      );
      return;
    }
    if (settings.skipDuplicatesAutomatically) {
      const dup = findLibraryDuplicate(canon, entries);
      if (dup) {
        notify(
          "Already in library (skipped). Turn off Skip duplicates to choose.",
          "warning",
        );
        return;
      }
    }
    const outputPath = saveToInternal ? internalVault : outputDir;
    const options = buildDownloadJobOptions(settings, outputPath, "replace");
    enqueueDownload(canon, options, {
      approval: "held",
      mirrorHeroUrl: true,
      heroUrlSourceHint: "explorer",
      enqueueSource: "explorerAdd",
    });
    flashLeftHint("add");
  }, [
    entries,
    enqueueDownload,
    flashLeftHint,
    lastExplorerUrl,
    notify,
    outputDir,
    removeDownloadJob,
    saveToInternal,
    setLastExplorerUrl,
    settings,
    storageBlocksNewDownloads,
  ]);

  if (!visible) return null;

  const tIcon = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  const storagePulse = leftHint === "storage";

  return (
    <div className="mr-0.5 flex h-10 max-w-[min(100vw-12rem,17rem)] flex-shrink-0 items-center gap-1.5">
      <AnimatePresence initial={false} mode="wait">
        {leftHint ? (
          <motion.span
            key={leftHint}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={
              leftHint === "storage"
                ? "pointer-events-none max-w-[9.5rem] text-right text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] text-amber-400/95"
                : "pointer-events-none max-w-[11rem] text-right text-[10px] font-medium leading-tight text-stone-400"
            }
          >
            {LEFT_HINT_LABEL[leftHint]}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <div className="group/tbar-tt relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={() => void handleClick()}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={titlebarIconButtonClass}
          aria-label={tooltip}
        >
          <span className={ICON_SLOT}>
            {storagePulse ? (
              <motion.span
                key="storage-warn"
                className="absolute inset-0 flex items-center justify-center text-amber-400"
                initial={{ x: 0 }}
                animate={{
                  x: [0, -2, 2, -2, 2, -1, 1, 0],
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <WarningPlaylistIcon className="text-current" />
              </motion.span>
            ) : (
              <>
                <motion.span
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{ opacity: inQueue ? 0 : 1, scale: inQueue ? 0.88 : 1 }}
                  transition={tIcon}
                >
                  <Icon icon="ic:round-playlist-add" width={18} height={18} />
                </motion.span>
                <motion.span
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{
                    opacity: inQueue && !hovering ? 1 : 0,
                    scale: inQueue && !hovering ? 1 : 0.88,
                  }}
                  transition={tIcon}
                >
                  <Icon icon="ic:round-playlist-add-check" width={18} height={18} />
                </motion.span>
                <motion.span
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{
                    opacity: inQueue && hovering ? 1 : 0,
                    scale: inQueue && hovering ? 1 : 0.88,
                  }}
                  transition={tIcon}
                >
                  <Icon icon="ic:round-playlist-remove" width={18} height={18} />
                </motion.span>
              </>
            )}
          </span>
        </button>

        <div role="tooltip" className={titlebarTooltipClassName}>
          {tooltip}
        </div>
      </div>
    </div>
  );
}

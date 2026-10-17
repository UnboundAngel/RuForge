import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { DownloaderView } from "../DownloaderView";
import {
  DownloaderCloseMorph,
  measureDownloaderCloseMorph,
  type DownloaderCloseMorphPayload,
} from "./DownloaderCloseMorph";
import { OVERLAY_Z_CLASS } from "../../lib/overlayZIndex";
import {
  motionDuration,
  overlayFadeTransition,
  overlayPanelTransition,
} from "../../lib/overlayMotion";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { useLibraryArrivals } from "../library/libraryArrivals";

type DownloaderOverlayProps = {
  open: boolean;
  onClose: () => void;
  internalDir: string;
  storageFull: boolean;
};

export function DownloaderOverlay({
  open,
  onClose,
  internalDir,
  storageFull,
}: DownloaderOverlayProps) {
  const reduceMotion = useReducedMotion();
  const [dismissReady, setDismissReady] = useState(false);
  const [fly, setFly] = useState<DownloaderCloseMorphPayload | null>(null);
  const [arrivalFly, setArrivalFly] = useState<{
    id: string;
    payload: DownloaderCloseMorphPayload;
  } | null>(null);
  // A start still fetching details lives in DownloaderView, so the view stays mounted (hidden) after
  // close until the job exists; unmounting it dropped the download.
  const startArmed = useRuforgeStore((s) => s.downloaderStartArmed);
  const duplicatePromptOpen = useRuforgeStore((s) => s.downloaderDuplicateDialogOpen);
  const openDownloader = useRuforgeStore((s) => s.openDownloader);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const hasActiveDownload = downloadJobs.some(
    (j) =>
      j.status === "queued" ||
      j.status === "downloading" ||
      j.status === "paused",
  );

  const requestClose = useCallback(() => {
    if (fly) return;
    const shouldMorph =
      !reduceMotion &&
      (hasActiveDownload || startArmed) &&
      Boolean(document.querySelector("[data-downloader-hero-thumb]"));
    if (shouldMorph) {
      const payload = measureDownloaderCloseMorph();
      if (payload) {
        setFly(payload);
        onClose();
        return;
      }
    }
    onClose();
  }, [fly, reduceMotion, hasActiveDownload, startArmed, onClose]);

  // The library card is hidden under this panel, so its flight waits for close; meanwhile show the
  // finished video dropping into the rail button that flight will start from.
  useEffect(() => {
    if (!open || reduceMotion) return;
    return useLibraryArrivals.subscribe((next, prev) => {
      const fresh = Object.entries(next.arrivals).find(
        ([key, arrival]) => prev.arrivals[key]?.at !== arrival.at,
      );
      if (!fresh) return;
      const payload = measureDownloaderCloseMorph(fresh[1].thumbnail);
      if (payload) setArrivalFly({ id: `${fresh[0]}:${fresh[1].at}`, payload });
    });
  }, [open, reduceMotion]);

  useEffect(() => {
    if (!open && startArmed && duplicatePromptOpen) openDownloader();
  }, [open, startArmed, duplicatePromptOpen, openDownloader]);

  useEffect(() => {
    if (!open) {
      setDismissReady(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (useRuforgeStore.getState().downloaderDuplicateDialogOpen) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  return (
    <>
      <AnimatePresence>
        {open || startArmed ? (
          <motion.div
            key="downloader-overlay"
            className={`fixed inset-0 ${OVERLAY_Z_CLASS.downloader} flex items-center justify-center bg-black/65 p-4 sm:p-6 ${open ? "" : "pointer-events-none"}`}
            role="presentation"
            inert={!open}
            aria-hidden={!open}
            initial={{ opacity: 0 }}
            animate={{ opacity: open ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={motionDuration(reduceMotion, overlayFadeTransition)}
            onAnimationComplete={() => {
              if (open) setDismissReady(true);
            }}
          >
            <button
              type="button"
              className={`absolute inset-0 cursor-default ${dismissReady ? "" : "pointer-events-none"}`}
              aria-label="Minimize downloads"
              onClick={requestClose}
            />
            <motion.div
              data-downloader-panel
              role="dialog"
              aria-modal="true"
              aria-labelledby="rf-downloader-dialog-title"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={motionDuration(reduceMotion, overlayPanelTransition)}
              className="relative flex h-[min(88vh,52rem)] w-full max-w-[min(90vw,72rem)] flex-col overflow-hidden rounded-[24px] bg-[color:var(--rf-surface)] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
              style={{ padding: 7 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="rf-downloader-dialog-title" className="sr-only">
                Downloads
              </h2>
              <button
                type="button"
                onClick={requestClose}
                className="absolute right-5 top-5 z-30 rounded-lg p-1.5 text-stone-500 transition-colors hover:text-stone-200 sm:right-7 sm:top-6"
                aria-label="Minimize downloads"
              >
                <X size={18} />
              </button>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[color:var(--rf-surface-deep)]">
                <DownloaderView internalDir={internalDir} storageFull={storageFull} />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {fly ? (
        <DownloaderCloseMorph payload={fly} onDone={() => setFly(null)} />
      ) : null}
      {arrivalFly && !fly ? (
        <DownloaderCloseMorph
          key={arrivalFly.id}
          payload={arrivalFly.payload}
          onDone={() => setArrivalFly(null)}
        />
      ) : null}
    </>
  );
}

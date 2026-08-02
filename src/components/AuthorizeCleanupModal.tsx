import { useEffect, useMemo, useState, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { releasePlaybackBeforeDelete } from "../releasePlaybackBeforeDelete";
import { X, Video, Trash2, CheckSquare, Square, Loader2 } from "lucide-react";
import { OVERLAY_Z_CLASS } from "../lib/overlayZIndex";
import { useRuforgeStore } from "../store/ruforgeStore";
import { youtubeUrlsMatch } from "../youtubeUrl";
import { askConfirm } from "./ConfirmDialog";
import {
  buildCleanupCandidates,
  bytesGoalSelectionCount,
  bytesToFreeForHeadroom,
  clearPlaybackStateForDeletedPaths,
  defaultSelectedPaths,
  formatBytes,
  formatCleanupBytes,
  type CleanupFilterMode,
  type CleanupCandidate,
} from "../cleanupCandidates";

type DeleteBatchProgress = {
  done: number;
  total: number;
  path: string;
  deletedBytes: number;
};


const CleanupItem = memo(({ 
  candidate: c, 
  checked, 
  busy, 
  onToggle 
}: { 
  candidate: CleanupCandidate; 
  checked: boolean; 
  busy: boolean; 
  onToggle: (path: string) => void;
}) => {
  const thumb = c.file.thumbnailPath || c.file.ruforgePosterPath;
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ 
        duration: 0.3,
        layout: { duration: 0.3 }
      }}
      onClick={() => !busy && onToggle(c.file.path)}
      className="group relative flex flex-col cursor-pointer"
    >
      <div className={`aspect-video rounded-2xl overflow-hidden transition-all duration-500 relative ${checked ? 'ring-2 ring-[color:var(--accent)] ring-offset-4 ring-offset-[#110D0B]' : 'opacity-70 hover:opacity-100 hover:scale-[1.02]'}`}>
        {thumb ? (
          <img
            src={convertFileSrc(thumb)}
            alt=""
            className={`h-full w-full object-cover transition-all duration-500 ${checked ? 'opacity-20 grayscale' : 'opacity-100'}`}
          />
        ) : (
          <div className="h-full w-full bg-stone-900 flex items-center justify-center text-stone-800">
            <Video size={32} strokeWidth={1} />
          </div>
        )}

        {/* Danger Wash for Deletion */}
        <div className={`absolute inset-0 bg-red-950/20 transition-opacity duration-500 ${checked ? 'opacity-100' : 'opacity-0'}`} />

        {/* Selected State Indicator (Top Right) */}
        <div className={`absolute top-3 right-3 transition-all duration-300 ${checked ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-45 pointer-events-none'}`}>
          <div className="w-10 h-10 rounded-full bg-[color:var(--accent)] text-[#110D0B] flex items-center justify-center">
            <Trash2 size={18} strokeWidth={2.5} />
          </div>
        </div>

        {/* Unselected Marker (Ghost) */}
        {!checked && (
          <div className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
            <Trash2 size={16} className="text-white/20 group-hover:text-white/40" />
          </div>
        )}

        {/* Progress Bar (Flush with bottom) */}
        {c.watchProgressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/5">
            <div className="h-full bg-[color:var(--accent)]" style={{ width: `${c.watchProgressPct}%` }} />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-1.5 px-1">
        <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-stone-200 group-hover:text-white truncate transition-colors">
          {c.file.name.replace(/\.[^/.]+$/, "")}
        </h4>
        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
          <span className="text-stone-600">{formatBytes(c.sizeBytes)}</span>
          <span className={`transition-colors ${c.watchProgressPct > 0 ? "text-[color:var(--accent)] opacity-80" : "text-stone-700"}`}>
            {c.watchProgressPct}% watched
          </span>
        </div>
      </div>
    </motion.div>
  );
});

CleanupItem.displayName = "CleanupItem";

export function AuthorizeCleanupModal() {
  const open = useRuforgeStore((s) => s.cleanupModalOpen);
  const close = useRuforgeStore((s) => s.closeAuthorizeCleanupModal);
  const entries = useRuforgeStore((s) => s.entries);
  const libraryLoading = useRuforgeStore((s) => s.galleryLoading);
  const limitGB = useRuforgeStore((s) => s.settings.storageLimitGB);
  const storageStats = useRuforgeStore((s) => s.storageStats);
  const notify = useRuforgeStore((s) => s.notify);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const removeGalleryEntryByPath = useRuforgeStore((s) => s.removeGalleryEntryByPath);

  const [mode, setMode] = useState<CleanupFilterMode>("oldest_unwatched");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [showDeselectWarning, setShowDeselectWarning] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMounted = useRef(true);
  const deleteProgressUnlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      deleteProgressUnlistenRef.current?.();
      deleteProgressUnlistenRef.current = null;
    };
  }, []);

  const bytesNeeded = useMemo(
    () => storageStats ? bytesToFreeForHeadroom(storageStats.total_bytes, limitGB) : null,
    [storageStats, limitGB],
  );

  const candidates = useMemo(() => buildCleanupCandidates(entries, mode), [entries, mode]);

  const selectedBytes = useMemo(() => {
    let n = 0;
    for (const c of candidates) {
      if (selected.has(c.file.path)) n += c.sizeBytes;
    }
    return n;
  }, [candidates, selected]);

  // Sync selection when opening or changing mode
  useEffect(() => {
    if (!open || bytesNeeded === null) return;
    setSelected(defaultSelectedPaths(candidates, bytesNeeded));
    setShowDeselectWarning(false);
    setScrolled(false);
  }, [open, mode, bytesNeeded === null]); // Only reset when opening or mode changes, or when stats finally load

  const onModeChange = useCallback((next: CleanupFilterMode) => {
    setMode(next);
  }, []);

  const togglePath = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        setShowDeselectWarning(true);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.file.path));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
      setShowDeselectWarning(true);
    } else {
      setSelected(new Set(candidates.map((c) => c.file.path)));
      setShowDeselectWarning(false);
    }
  }, [allSelected, candidates]);

  const handleConfirm = async () => {
    const selectedCandidates = candidates.filter((c) => selected.has(c.file.path));
    const paths = selectedCandidates.map((c) => c.file.path);
    if (paths.length === 0) {
      notify("Select at least one video to remove.", "warning");
      return;
    }

    const approved = await askConfirm({
      title: "Delete videos",
      message: `Remove ${paths.length} selected item${paths.length === 1 ? "" : "s"} from your library?`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      itemMeta: `${formatBytes(selectedBytes)} • ${paths.length} items`
    });
    if (!approved) return;

    setBusy(true);
    setDeleteProgress({ done: 0, total: paths.length });
    const deletedPaths: string[] = [];
    try {
      deleteProgressUnlistenRef.current?.();
      const unlistenProgress = await listen<DeleteBatchProgress>(
        "delete-media-batch-progress",
        (event) => {
          const { done, total, path } = event.payload;
          deletedPaths.push(path);
          removeGalleryEntryByPath(path);
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
          if (isMounted.current) setDeleteProgress({ done, total });
        },
      );
      deleteProgressUnlistenRef.current = unlistenProgress;

      await releasePlaybackBeforeDelete(paths);
      const deleted = await invoke<number>("delete_media_batch", { paths });
      clearPlaybackStateForDeletedPaths(deletedPaths.length > 0 ? deletedPaths : paths);

      const removedSet = new Set(deletedPaths);
      const jobIds = new Set<string>();
      for (const c of selectedCandidates) {
        if (!removedSet.has(c.file.path)) continue;
        const sourceUrl = c.file.sourceUrl?.trim();
        if (!sourceUrl) continue;
        for (const j of useRuforgeStore.getState().downloadJobs) {
          if (youtubeUrlsMatch(j.url, sourceUrl)) {
            jobIds.add(j.id);
          }
        }
      }
      const removeDownloadJob = useRuforgeStore.getState().removeDownloadJob;
      for (const id of jobIds) {
        await removeDownloadJob(id);
      }

      await refreshStorageStats();
      if (isMounted.current) {
        notify(`Freed ${formatBytes(deleted)} from your library.`);
        close();
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (isMounted.current) {
        if (/os error 32|being used by another process/i.test(msg)) {
          notify("Close the video before deleting it.", "warning");
        } else {
          notify("Cleanup failed.", "error");
        }
      }
    } finally {
      deleteProgressUnlistenRef.current?.();
      deleteProgressUnlistenRef.current = null;
      if (isMounted.current) {
        setBusy(false);
        setDeleteProgress(null);
      }
    }
  };

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const isScrolled = e.currentTarget.scrollTop > 20;
    setScrolled((prev) => prev !== isScrolled ? isScrolled : prev);
  }, []);

  const shortfall =
    bytesNeeded !== null && bytesNeeded > 0 && selectedBytes < bytesNeeded ? bytesNeeded - selectedBytes : 0;

  const hasByteGoal = bytesNeeded !== null && bytesNeeded > 0;
  const goalItemCount = useMemo(
    () => (hasByteGoal ? bytesGoalSelectionCount(candidates, bytesNeeded!) : 0),
    [candidates, hasByteGoal, bytesNeeded],
  );

  const progressPct = useMemo(() => {
    if (selected.size === 0) return 0;
    if (hasByteGoal) return Math.min(100, (selectedBytes / bytesNeeded!) * 100);
    if (candidates.length === 0) return 0;
    return Math.min(100, (selected.size / candidates.length) * 100);
  }, [selected.size, selectedBytes, hasByteGoal, bytesNeeded, candidates.length]);

  const goalMet = hasByteGoal && selectedBytes >= bytesNeeded!;
  const barFillColor =
    selected.size === 0
      ? "transparent"
      : goalMet
        ? "var(--accent)"
        : "rgb(120 113 108)"; // stone-500 brown-gray

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed bottom-0 left-0 right-0 top-[var(--rf-titlebar-h)] ${OVERLAY_Z_CLASS.fullscreen} flex flex-col bg-[#110D0B] text-stone-100 selection:bg-[color:var(--accent)] selection:text-[#110D0B]`}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`relative z-10 flex h-16 w-full flex-shrink-0 items-center justify-between bg-[#1D1613] px-10 transition-shadow duration-200 ${scrolled ? "shadow-[0_8px_24px_rgba(0,0,0,0.35)]" : ""}`}
          >
            <div className="pointer-events-none flex items-center gap-10">
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Storage
                </p>
                <h2 className="text-sm font-semibold text-stone-100">
                  Free internal space
                </h2>
              </div>

              <LayoutGroup id="cleanup-filters">
                <div className="pointer-events-auto flex items-center gap-1">
                  {(
                    [
                      ["oldest_unwatched", "Oldest"],
                      ["oldest_watched", "Watched"],
                      ["least_watched", "Least Watched"],
                    ] as const
                  ).map(([value, label]) => {
                    const isActive = mode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onModeChange(value)}
                        className={`relative rounded-full px-5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${isActive ? "text-[#110D0B]" : "text-stone-500 hover:text-stone-300"}`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="filter-bg"
                            className="absolute inset-0 z-0 rounded-full bg-[color:var(--accent)]"
                            transition={{ type: "spring", bounce: 0.1, duration: 0.5 }}
                          />
                        )}
                        <span className="relative z-10">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </LayoutGroup>
            </div>

            <div className="pointer-events-auto flex items-center gap-8">
              <div className="flex min-w-[12rem] flex-col items-end gap-1.5">
                <div className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {hasByteGoal ? "Goal progress" : "Selected"}
                  </span>
                  {bytesNeeded === null || libraryLoading ? (
                    <Loader2 size={10} className="animate-spin text-stone-700" />
                  ) : (
                    <span
                      className={`text-[10px] font-black tracking-wide transition-colors ${
                        goalMet ? "text-[color:var(--accent)]" : "text-stone-300"
                      }`}
                    >
                      {selected.size}
                      {hasByteGoal && goalItemCount > 0 ? ` / ${goalItemCount}` : ""} item
                      {selected.size === 1 ? "" : "s"}
                      {hasByteGoal ? (
                        <span className="font-semibold text-stone-600">
                          {" "}
                          · {formatCleanupBytes(selectedBytes)} / {formatCleanupBytes(bytesNeeded)}
                        </span>
                      ) : selectedBytes > 0 ? (
                        <span className="font-semibold text-stone-600">
                          {" "}
                          · {formatCleanupBytes(selectedBytes)}
                        </span>
                      ) : null}
                    </span>
                  )}
                </div>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-stone-800/80">
                  <motion.div
                    initial={false}
                    animate={{
                      width: `${progressPct}%`,
                      backgroundColor: barFillColor,
                    }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="flex h-10 w-10 items-center justify-center rounded-full text-stone-400 transition-colors hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Close storage cleanup"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col relative">
            {/* Minimal Toolbar (Hides on Scroll) */}
            <motion.div
              animate={{
                height: scrolled ? 0 : 48,
                opacity: scrolled ? 0 : 1,
              }}
              className="flex items-center justify-between px-10 bg-[#261d18]/40 relative z-10 overflow-hidden"
            >
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-stone-200 transition-colors group"
              >
                <div className={`transition-colors ${allSelected ? 'text-[color:var(--accent)]' : 'text-stone-700 group-hover:text-stone-500'}`}>
                  {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </div>
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </motion.div>

            {/* Grid */}
            <div 
              className="flex-1 overflow-y-auto p-10 relative z-10"
              onScroll={handleScroll}
            >
              {libraryLoading && candidates.length === 0 ? (
                <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 text-stone-500">
                  <Loader2 size={22} className="animate-spin text-[color:var(--accent)]" />
                  <p className="text-[10px] font-black uppercase tracking-[0.28em]">
                    Loading library…
                  </p>
                </div>
              ) : (
                <LayoutGroup id="cleanup-grid">
                  <motion.div 
                    layout
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8"
                  >
                    <AnimatePresence mode="popLayout">
                      {candidates.map((c) => (
                        <CleanupItem
                          key={c.file.path}
                          candidate={c}
                          checked={selected.has(c.file.path)}
                          busy={busy}
                          onToggle={togglePath}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </LayoutGroup>
              )}
            </div>
          </div>

          {/* Slim Integrated Footer */}
          <div className="h-24 w-full flex-shrink-0 flex items-center justify-between px-12 bg-[#1D1613] relative z-20 mt-2">
            <div className="flex items-center gap-14">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Selection</span>
                <div className="flex items-baseline gap-3">
                  <p className="text-2xl font-black text-stone-100">
                    {selected.size} items
                  </p>
                  <p className="text-2xl font-black text-[color:var(--accent)]">
                    {formatBytes(selectedBytes)}
                  </p>
                </div>
              </div>

              {showDeselectWarning && shortfall > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-[var(--radius-input)] bg-amber-500/10 px-5 py-2.5"
                >
                  <span className="text-[11px] font-medium text-amber-400/90">
                    Need {formatBytes(shortfall)} more to reach the goal.
                  </span>
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={close}
                disabled={busy}
                className="px-8 py-3 text-[11px] font-black uppercase tracking-[0.3em] text-stone-500 hover:text-stone-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                Cancel
              </button>
              <button
                disabled={busy || selected.size === 0}
                onClick={() => void handleConfirm()}
                className={`h-12 px-10 rounded-[var(--radius-input)] text-[10px] font-black uppercase tracking-[0.2em] transition-all inline-flex items-center gap-2 ${
                  busy
                    ? "bg-[color:var(--accent)] text-[#110D0B] cursor-wait"
                    : selected.size === 0
                      ? "bg-stone-800 text-stone-600 opacity-30 cursor-not-allowed"
                      : "bg-[color:var(--accent)] text-[#110D0B] active:scale-[0.98]"
                }`}
              >
                {busy && deleteProgress ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Deleting {deleteProgress.done} of {deleteProgress.total}
                  </>
                ) : busy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete selected"
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

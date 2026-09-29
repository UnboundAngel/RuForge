import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Loader2 } from "lucide-react";
import { releasePlaybackBeforeDelete } from "../releasePlaybackBeforeDelete";
import { OVERLAY_Z_CLASS } from "../lib/overlayZIndex";
import { cn } from "../lib/utils";
import { useRuforgeStore } from "../store/ruforgeStore";
import { youtubeUrlsMatch } from "../youtubeUrl";
import { askConfirm } from "./ConfirmDialog";
import { CLEANUP_HEADER_H, CleanupListHeader } from "./CleanupListRow";
import { CleanupSection } from "./CleanupSection";
import { cleanupGroupMeta } from "./cleanupCategoryStyle";
import {
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalShell,
} from "./settings/SettingsModalShell";
import {
  buildCleanupCandidates,
  bytesToFreeForHeadroom,
  clearPlaybackStateForDeletedPaths,
  defaultSelectedPaths,
  formatBytes,
  formatCleanupBytes,
  groupCleanupCandidates,
  sortCleanupCandidates,
  type CleanupCategory,
  type CleanupFilterMode,
  type CleanupSort,
  type CleanupSortKey,
} from "../cleanupCandidates";

type DeleteBatchProgress = {
  done: number;
  total: number;
  path: string;
  deletedBytes: number;
};

/** Every internal video, least watched first (oldest breaks ties), so the default picks are the safest to lose. */
const LIST_MODE: CleanupFilterMode = "least_watched";

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

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);
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
    () => (storageStats ? bytesToFreeForHeadroom(storageStats.total_bytes, limitGB) : null),
    [storageStats, limitGB],
  );

  const candidates = useMemo(() => buildCleanupCandidates(entries, LIST_MODE), [entries]);
  const [sort, setSort] = useState<CleanupSort | null>(null);
  const groups = useMemo(
    () => groupCleanupCandidates(sortCleanupCandidates(candidates, sort)),
    [candidates, sort],
  );
  const [stuckCategories, setStuckCategories] = useState<ReadonlySet<CleanupCategory>>(() => new Set());
  const onSectionStuck = useCallback((category: CleanupCategory, stuck: boolean) => {
    setStuckCategories((prev) => {
      if (prev.has(category) === stuck) return prev;
      const next = new Set(prev);
      if (stuck) next.add(category);
      else next.delete(category);
      return next;
    });
  }, []);
  const currentGroup = useMemo(() => {
    for (let i = groups.length - 1; i >= 0; i--) {
      if (stuckCategories.has(groups[i].category)) return groups[i];
    }
    return null;
  }, [groups, stuckCategories]);
  // First click sorts, the second flips it, the third goes back to least watched first.
  const onSort = (key: CleanupSortKey) =>
    setSort((cur) => {
      if (cur?.key !== key) return { key, desc: key === "size" || key === "watched" };
      if (cur.desc === (key === "size" || key === "watched")) return { key, desc: !cur.desc };
      return null;
    });

  const selectedBytes = useMemo(() => {
    let n = 0;
    for (const c of candidates) {
      if (selected.has(c.file.path)) n += c.sizeBytes;
    }
    return n;
  }, [candidates, selected]);

  // Only reset when opening or when stats finally load.
  useEffect(() => {
    if (!open || bytesNeeded === null) return;
    setSelected(defaultSelectedPaths(candidates, bytesNeeded));
    setSort(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bytesNeeded === null]);

  const togglePath = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.file.path));
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.file.path)));
  };

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
      itemMeta: `${formatBytes(selectedBytes)} • ${paths.length} items`,
    });
    if (!approved) return;

    setBusy(true);
    setDeleteProgress({ done: 0, total: paths.length });
    const deletedPaths: string[] = [];
    try {
      deleteProgressUnlistenRef.current?.();
      const unlistenProgress = await listen<DeleteBatchProgress>("delete-media-batch-progress", (event) => {
        const { done, total, path } = event.payload;
        deletedPaths.push(path);
        removeGalleryEntryByPath(path);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        if (isMounted.current) setDeleteProgress({ done, total });
      });
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
          if (youtubeUrlsMatch(j.url, sourceUrl)) jobIds.add(j.id);
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

  const hasByteGoal = bytesNeeded !== null && bytesNeeded > 0;
  const goalMet = hasByteGoal && selectedBytes >= bytesNeeded;
  const shortfall = hasByteGoal && !goalMet ? bytesNeeded - selectedBytes : 0;
  const progressPct = hasByteGoal
    ? Math.min(100, (selectedBytes / bytesNeeded) * 100)
    : candidates.length > 0
      ? (selected.size / candidates.length) * 100
      : 0;

  const description = hasByteGoal
    ? `Free about ${formatCleanupBytes(bytesNeeded)} to get back under your ${limitGB} GB limit.`
    : undefined;

  return (
    <SettingsModalShell
      open={open}
      onClose={close}
      titleId="rf-cleanup-title"
      eyebrow={null}
      title="Free internal space"
      description={description}
      zIndexClass={OVERLAY_Z_CLASS.fullscreen}
      maxWidthClass="max-w-[min(90vw,72rem)]"
      maxHeightClass="max-h-[min(88vh,52rem)]"
      bezel
      bodyScrollInsetTop={candidates.length > 0 ? CLEANUP_HEADER_H : undefined}
      bodyClassName="pt-0 pb-1"
      footerClassName="pb-4 pt-3"
      disableDismiss={busy}
      footer={
        <>
          <p className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-stone-500">
            {shortfall > 0 && selected.size > 0 ? (
              <span className="text-amber-400/90">Need {formatBytes(shortfall)} more to reach the goal</span>
            ) : (
              <>
                <span className="font-semibold text-stone-200">{selected.size}</span> selected
                {selectedBytes > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-stone-200">{formatBytes(selectedBytes)}</span>
                  </>
                )}
              </>
            )}
            {candidates.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                disabled={busy}
                className="ml-3 font-semibold text-stone-400 transition-colors hover:text-stone-100 disabled:opacity-40"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            )}
          </p>
          <div className="mx-3 flex min-w-0 flex-1 items-center gap-3">
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[#261d18]">
              <div
                className={cn(
                  "h-full origin-left rounded-full transition-[transform,background-color] duration-200 ease-out",
                  goalMet || !hasByteGoal ? "bg-[color:var(--accent)]" : "bg-stone-500",
                )}
                style={{ transform: `scaleX(${progressPct / 100})` }}
              />
            </div>
            {hasByteGoal && (
              <span className="shrink-0 text-[11px] tabular-nums text-stone-500">
                {formatCleanupBytes(selectedBytes)} of {formatCleanupBytes(bytesNeeded)}
              </span>
            )}
          </div>
          <SettingsModalBtnSecondary onClick={close} disabled={busy}>
            Cancel
          </SettingsModalBtnSecondary>
          <SettingsModalBtnPrimary
            onClick={() => void handleConfirm()}
            disabled={busy || selected.size === 0}
            className="gap-2 bg-red-500/90 text-stone-100 hover:brightness-110"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy && deleteProgress
              ? `Deleting ${deleteProgress.done} of ${deleteProgress.total}`
              : busy
                ? "Deleting…"
                : "Delete selected"}
          </SettingsModalBtnPrimary>
        </>
      }
    >
      {candidates.length > 0 && (
        <CleanupListHeader
          sort={sort}
          onSort={onSort}
          current={
            currentGroup
              ? { category: currentGroup.category, meta: cleanupGroupMeta(currentGroup, selected) }
              : null
          }
        />
      )}

      {libraryLoading && candidates.length === 0 ? (
        <div className="flex min-h-[10rem] items-center justify-center gap-2 text-[12px] text-stone-500">
          <Loader2 size={16} className="animate-spin text-[color:var(--accent)]" />
          Loading library…
        </div>
      ) : candidates.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-stone-500">
          nothing to clean up here, internal storage has no videos.
        </p>
      ) : (
        <div className="flex flex-col">
          {groups.map((group) => (
            <CleanupSection
              key={group.category}
              group={group}
              selected={selected}
              busy={busy}
              onToggle={togglePath}
              onStuckChange={onSectionStuck}
            />
          ))}
        </div>
      )}
    </SettingsModalShell>
  );
}

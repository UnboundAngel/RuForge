import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRuforgeStore } from "../store/ruforgeStore";
import {
  buildCleanupCandidates,
  bytesToFreeForHeadroom,
  clearPlaybackStateForDeletedPaths,
  defaultSelectedPaths,
  formatBytes,
  type CleanupFilterMode,
} from "../cleanupCandidates";

export function AuthorizeCleanupModal() {
  const open = useRuforgeStore((s) => s.cleanupModalOpen);
  const close = useRuforgeStore((s) => s.closeAuthorizeCleanupModal);
  const entries = useRuforgeStore((s) => s.entries);
  const limitGB = useRuforgeStore((s) => s.settings.storageLimitGB);
  const storageStats = useRuforgeStore((s) => s.storageStats);
  const notify = useRuforgeStore((s) => s.notify);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const invalidateEntries = useRuforgeStore((s) => s.invalidateEntries);

  const [mode, setMode] = useState<CleanupFilterMode>("oldest_unwatched");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [showDeselectWarning, setShowDeselectWarning] = useState(false);

  const bytesNeeded = useMemo(
    () => bytesToFreeForHeadroom(storageStats?.total_bytes ?? 0, limitGB),
    [storageStats?.total_bytes, limitGB],
  );

  const candidates = useMemo(() => buildCleanupCandidates(entries, mode), [entries, mode]);

  const selectedBytes = useMemo(() => {
    let n = 0;
    for (const c of candidates) {
      if (selected.has(c.file.path)) n += c.sizeBytes;
    }
    return n;
  }, [candidates, selected]);

  const initSelection = (nextMode: CleanupFilterMode) => {
    const list = buildCleanupCandidates(entries, nextMode);
    setSelected(defaultSelectedPaths(list, bytesNeeded));
    setShowDeselectWarning(false);
  };

  useEffect(() => {
    if (!open) return;
    setMode("oldest_unwatched");
    initSelection("oldest_unwatched");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when modal opens
  }, [open]);

  if (!open) return null;

  const onModeChange = (next: CleanupFilterMode) => {
    setMode(next);
    initSelection(next);
  };

  const togglePath = (path: string) => {
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
  };

  const selectAll = () => {
    setSelected(new Set(candidates.map((c) => c.file.path)));
    setShowDeselectWarning(false);
  };

  const handleConfirm = async () => {
    const paths = candidates.filter((c) => selected.has(c.file.path)).map((c) => c.file.path);
    if (paths.length === 0) {
      notify("Select at least one video to remove.", "warning");
      return;
    }
    setBusy(true);
    try {
      const deleted = await invoke<number>("delete_media_batch", { paths });
      clearPlaybackStateForDeletedPaths(paths);
      await refreshStorageStats();
      await invalidateEntries({ silent: true });
      notify(`Freed ${formatBytes(deleted)} from your library.`);
      close();
    } catch (e) {
      console.error(e);
      notify("Cleanup failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const shortfall =
    bytesNeeded > 0 && selectedBytes < bytesNeeded ? bytesNeeded - selectedBytes : 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="authorize-cleanup-title"
    >
      <div className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#1D1613] shadow-2xl">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="authorize-cleanup-title" className="text-sm font-black uppercase tracking-widest text-stone-200">
            Authorize cleanup
          </h2>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
            These are the oldest videos that you currently have in your library that you have not yet watched.
          </p>
          {bytesNeeded > 0 && (
            <p className="mt-1 text-[10px] text-stone-500">
              Target: free at least {formatBytes(bytesNeeded)} to reach ~75% of your {limitGB} GB cap.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-white/10 px-5 py-3">
          {(
            [
              ["oldest_unwatched", "Oldest unwatched"],
              ["oldest_watched", "Oldest watched"],
              ["least_watched", "Watched least"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              onClick={() => onModeChange(value)}
              className={`rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                mode === value
                  ? "bg-[color:var(--accent)]/20 text-[color:var(--accent)]"
                  : "bg-white/5 text-stone-500 hover:text-stone-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-500">No videos match this filter.</p>
          ) : (
            candidates.map((c) => {
              const checked = selected.has(c.file.path);
              return (
                <label
                  key={c.file.path}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    checked
                      ? "border-[color-mix(in_srgb,var(--accent),transparent_70%)] bg-white/[0.04]"
                      : "border-white/10 bg-white/[0.02] opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => togglePath(c.file.path)}
                    className="h-3.5 w-3.5 accent-[color:var(--accent)]"
                  />
                  <div className="flex flex-1 items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-wider text-stone-300">
                    <span>{c.watchProgressPct}% watched</span>
                    <span className="text-stone-500">{formatBytes(c.sizeBytes)}</span>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="space-y-2 border-t border-white/10 px-5 py-4">
          {showDeselectWarning && shortfall > 0 && (
            <p className="text-[10px] leading-relaxed text-amber-200/90">
              Deselecting items may leave less than {formatBytes(bytesNeeded)} free — future downloads could still be
              blocked until you remove more.
            </p>
          )}
          <div className="flex items-center justify-between text-[10px] text-stone-500">
            <span>
              {selected.size} selected · {formatBytes(selectedBytes)}
            </span>
            <button
              type="button"
              disabled={busy || candidates.length === 0}
              onClick={selectAll}
              className="font-black uppercase tracking-wider text-stone-400 hover:text-stone-200"
            >
              Select all
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-[10px] font-black uppercase tracking-widest text-stone-400 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void handleConfirm()}
              className="flex-1 rounded-xl bg-[color:var(--accent)]/20 py-2.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--accent)] hover:bg-[color:var(--accent)]/30 disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

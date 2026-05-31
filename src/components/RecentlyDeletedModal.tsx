import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Trash2, RotateCcw, Loader2 } from "lucide-react";
import {
  listRecentlyDeleted,
  restoreRecentlyDeleted,
  removeRecentlyDeletedEntry,
  type RecentlyDeletedEntry,
} from "../lib/recentlyDeleted";
import { useRuforgeStore } from "../store/ruforgeStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

function formatDeletedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RecentlyDeletedModal({ open, onClose }: Props) {
  const notify = useRuforgeStore((s) => s.notify);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const [entries, setEntries] = useState<RecentlyDeletedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listRecentlyDeleted();
      setEntries(list);
    } catch (e) {
      console.error(e);
      notify("Could not load Recently Deleted.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleRestore = async (entry: RecentlyDeletedEntry) => {
    if (!entry.recoverable || busyId) return;
    setBusyId(entry.id);
    try {
      const result = await restoreRecentlyDeleted(entry.id);
      if (result.restored) {
        notify("Restored to your library.");
        await fetchEntries();
        await refresh();
      } else if (!result.recoverable) {
        notify("Files are no longer in the system Recycle Bin.", "warning");
        await refresh();
      } else {
        notify("Restore could not complete.", "error");
      }
    } catch (e) {
      console.error(e);
      notify("Restore failed.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (entry: RecentlyDeletedEntry) => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      await removeRecentlyDeletedEntry(entry.id);
      await refresh();
    } catch (e) {
      console.error(e);
      notify("Could not remove entry.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="relative z-10 w-full max-w-lg max-h-[min(70vh,520px)] flex flex-col rounded-3xl border border-stone-50/10 bg-[#1D1613] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-50/5 shrink-0">
              <div className="flex items-center gap-2">
                <Trash2 size={18} className="text-stone-400" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-stone-200">
                  Recently Deleted
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-stone-500 hover:text-stone-200 transition-colors p-1"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="px-5 py-3 text-xs text-stone-500 border-b border-stone-50/5 shrink-0">
              Items moved to the system Recycle Bin. Restore puts files back in your library folder.
            </p>

            <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-stone-500">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : entries.length === 0 ? (
                <p className="text-center text-sm text-stone-500 py-16">Nothing here yet.</p>
              ) : (
                <ul className="space-y-2">
                  {entries.map((entry) => {
                    const busy = busyId === entry.id;
                    return (
                      <li
                        key={entry.id}
                        className="flex items-center gap-3 rounded-2xl bg-black/20 border border-stone-50/5 px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-100 truncate">
                            {entry.title}
                          </p>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            {formatDeletedAt(entry.deletedAt)}
                            {" · "}
                            {entry.files.length} file{entry.files.length === 1 ? "" : "s"}
                          </p>
                          {!entry.recoverable ? (
                            <p className="text-[11px] text-amber-600/90 mt-1">
                              Unrecoverable (Recycle Bin emptied)
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {entry.recoverable ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRestore(entry)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[color:var(--accent)] text-[#110D0B] hover:opacity-90 disabled:opacity-50 transition-opacity"
                            >
                              {busy ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RotateCcw size={14} />
                              )}
                              Restore
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDismiss(entry)}
                            className="px-2 py-1.5 text-xs text-stone-500 hover:text-stone-300 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

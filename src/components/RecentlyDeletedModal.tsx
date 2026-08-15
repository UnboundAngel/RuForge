import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Loader2, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  listRecentlyDeleted,
  restoreRecentlyDeleted,
  removeRecentlyDeletedEntry,
  type RecentlyDeletedEntry,
} from "../lib/recentlyDeleted";
import { useRuforgeStore } from "../store/ruforgeStore";
import { SettingsModalShell } from "./settings/SettingsModalShell";

type Props = {
  open: boolean;
  onClose: () => void;
};

type BusyKind = "restore" | "forget";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; kind: BusyKind } | null>(null);
  const loadGen = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    try {
      const list = await listRecentlyDeleted();
      if (gen !== loadGen.current) return;
      setEntries(list);
      setSelectedId((prev) => {
        if (prev && list.some((e) => e.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      console.error(e);
      if (gen === loadGen.current) notify("Could not load Recently Deleted.", "error");
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (open) void refresh();
    else {
      loadGen.current += 1;
      setSelectedId(null);
      setBusy(null);
      setLoading(false);
    }
  }, [open, refresh]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const recoverableCount = entries.filter((e) => e.recoverable).length;
  const isBusy = busy !== null;

  const pickNextSelection = (list: RecentlyDeletedEntry[], removedId: string) => {
    if (list.length === 0) return null;
    const idx = list.findIndex((e) => e.id === removedId);
    const next = list[idx] ?? list[idx - 1] ?? list[0];
    return next?.id ?? null;
  };

  const handleRestore = async (entry: RecentlyDeletedEntry) => {
    if (!entry.recoverable || isBusy) return;
    setBusy({ id: entry.id, kind: "restore" });
    try {
      const result = await restoreRecentlyDeleted(entry.id);
      if (result.restored) {
        await new Promise((r) => setTimeout(r, 380));
        setEntries((prev) => {
          const next = prev.filter((e) => e.id !== entry.id);
          setSelectedId(pickNextSelection(next, entry.id));
          return next;
        });
        notify("Restored to your library.");
        void fetchEntries({
          manageLoadingStart: false,
          skipPosterBackfill: true,
          skipScrubBackfill: true,
        });
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
      setBusy(null);
    }
  };

  const handleDismiss = async (entry: RecentlyDeletedEntry) => {
    if (isBusy) return;
    setBusy({ id: entry.id, kind: "forget" });
    try {
      await removeRecentlyDeletedEntry(entry.id);
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== entry.id);
        setSelectedId(pickNextSelection(next, entry.id));
        return next;
      });
    } catch (e) {
      console.error(e);
      notify("Could not remove entry.", "error");
    } finally {
      setBusy(null);
    }
  };

  const footer =
    selected && entries.length > 0 ? (
      <div className="flex w-full flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void handleDismiss(selected)}
          className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 transition-[color,font-weight] duration-200 hover:font-bold hover:text-stone-200 disabled:pointer-events-none disabled:opacity-40"
        >
          {busy?.id === selected.id && busy.kind === "forget" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Forgetting…
            </span>
          ) : (
            "Forget"
          )}
        </button>
        {selected.recoverable ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleRestore(selected)}
            className="inline-flex items-center gap-2 rounded-[var(--radius-input)] bg-[color:var(--accent)] px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#1D1613] transition-[transform,opacity,filter] duration-200 hover:opacity-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
          >
            {busy?.id === selected.id && busy.kind === "restore" ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Recovering…
              </>
            ) : (
              <>
                <Undo2 size={15} strokeWidth={2.75} aria-hidden />
                Restore
              </>
            )}
          </button>
        ) : null}
      </div>
    ) : undefined;

  return (
    <SettingsModalShell
      open={open}
      onClose={onClose}
      titleId="recently-deleted-title"
      eyebrow="Recovery vault"
      icon={Archive}
      title="Recently discarded"
      description="Select an item, then restore it to your library or forget the record here."
      zIndexClass="z-[120]"
      maxWidthClass="max-w-lg"
      disableDismiss={isBusy}
      footer={footer}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-stone-500">
          <Loader2 size={22} className="animate-spin" aria-label="Loading" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[var(--radius-input)] bg-[#261d18] py-10 text-center">
          <Archive size={22} className="mx-auto text-stone-600" strokeWidth={1.5} />
          <p className="mt-4 text-sm font-medium text-stone-300">Nothing discarded</p>
          <p className="mt-2 text-[12px] leading-relaxed text-stone-500">
            Deleted media will appear here until you restore it or clear the list.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            {entries.length} {entries.length === 1 ? "item" : "items"}
            <span className="text-stone-600"> · </span>
            <span className="text-[color:var(--accent)]">
              {recoverableCount} recoverable
            </span>
          </p>

          <ul className="space-y-2" role="listbox" aria-label="Discarded items">
            <AnimatePresence mode="popLayout">
              {entries.map((entry) => {
                const isSelected = entry.id === selectedId;
                const isRecoverable = entry.recoverable;
                const rowBusy = busy?.id === entry.id;
                const restoring = rowBusy && busy?.kind === "restore";

                return (
                  <motion.li
                    key={entry.id}
                    layout
                    role="option"
                    aria-selected={isSelected}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{
                      opacity: restoring ? 0.85 : 1,
                      y: 0,
                      scale: restoring ? 0.98 : 1,
                    }}
                    exit={{
                      opacity: 0,
                      x: 28,
                      scale: 0.96,
                      transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      type="button"
                      disabled={isBusy && !rowBusy}
                      onClick={() => setSelectedId(entry.id)}
                      className={`group relative w-full rounded-[var(--radius-input)] px-4 py-3.5 text-left transition-[background-color,box-shadow] duration-200 disabled:pointer-events-none ${
                        isSelected
                          ? "bg-[#2e241f] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent),transparent_55%)]"
                          : "bg-[#261d18] hover:bg-[#2a211c]"
                      } ${!isRecoverable ? "opacity-60" : ""}`}
                    >
                      {restoring ? (
                        <motion.div
                          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-[inherit] bg-[#261d18]/90"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.15 }}
                        >
                          <motion.span
                            animate={{ rotate: [0, -28, 0] }}
                            transition={{
                              duration: 0.9,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                          >
                            <Undo2
                              size={18}
                              strokeWidth={2.5}
                              className="text-[color:var(--accent)]"
                            />
                          </motion.span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-300">
                            Recovering…
                          </span>
                        </motion.div>
                      ) : null}

                      <div className="min-w-0 pr-2">
                        <p
                          className={`text-sm font-semibold leading-snug truncate transition-colors duration-200 ${
                            isSelected
                              ? "text-stone-50 group-hover:text-stone-50"
                              : isRecoverable
                                ? "text-stone-200 group-hover:text-stone-50"
                                : "text-stone-400"
                          }`}
                        >
                          {entry.title}
                        </p>
                        <p className="mt-1 text-[11px] text-stone-500">
                          {formatDeletedAt(entry.deletedAt)}
                          <span className="text-stone-600"> · </span>
                          {entry.files.length} file
                          {entry.files.length === 1 ? "" : "s"}
                        </p>
                        {!isRecoverable ? (
                          <p className="mt-1.5 text-[11px] font-medium text-stone-500">
                            Permanently discarded
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </>
      )}
    </SettingsModalShell>
  );
}

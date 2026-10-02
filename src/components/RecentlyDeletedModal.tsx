import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronDown, Loader2, Undo2, Video } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/utils";
import { HoverMarqueeText } from "./music/HoverMarqueeText";
import { useStuckHeader } from "../hooks/useStuckHeader";
import { formatStorageSize } from "../formatStorageSize";
import {
  listRecentlyDeleted,
  restoreRecentlyDeleted,
  removeRecentlyDeletedEntry,
  type RecentlyDeletedEntry,
} from "../lib/recentlyDeleted";
import { useRuforgeStore } from "../store/ruforgeStore";
import { systemTrashName } from "../platformPaths";
import {
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalShell,
} from "./settings/SettingsModalShell";

type Props = {
  open: boolean;
  onClose: () => void;
};

type BusyKind = "restore" | "forget";
type VaultSort = "newest" | "oldest" | "name" | "size";

const SORTS: { key: VaultSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "name", label: "Name" },
  { key: "size", label: "Size" },
];

const TOOLBAR_H = 44;
const EASE = [0.16, 1, 0.3, 1] as const;
const VAULT_GRID = "grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-x-2 gap-y-3";

function formatDeletedTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ageMs = Date.now() - d.getTime();
  if (ageMs < 2 * 86_400_000) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const deletedMs = (e: RecentlyDeletedEntry) => {
  const t = new Date(e.deletedAt).getTime();
  return Number.isNaN(t) ? 0 : t;
};

function sortEntries(list: RecentlyDeletedEntry[], sort: VaultSort): RecentlyDeletedEntry[] {
  const out = [...list];
  switch (sort) {
    case "newest":
      return out.sort((a, b) => deletedMs(b) - deletedMs(a));
    case "oldest":
      return out.sort((a, b) => deletedMs(a) - deletedMs(b));
    case "name":
      return out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }));
    case "size":
      return out.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1));
  }
}

type VaultGroup = { key: string; label: string | null; entries: RecentlyDeletedEntry[] };

/** Recoverable items follow the chosen sort; anything already gone from the trash goes to a collapsed section. */
function buildGroups(entries: RecentlyDeletedEntry[], sort: VaultSort): { groups: VaultGroup[]; gone: RecentlyDeletedEntry[] } {
  const sorted = sortEntries(entries, sort);
  const live = sorted.filter((e) => e.recoverable);
  const gone = sorted.filter((e) => !e.recoverable);
  const groups: VaultGroup[] = [];
  if (sort === "newest" || sort === "oldest") {
    const now = new Date();
    const byDay = new Map<string, RecentlyDeletedEntry[]>();
    for (const entry of live) {
      const label = dayLabel(entry.deletedAt, now);
      const list = byDay.get(label);
      if (list) list.push(entry);
      else byDay.set(label, [entry]);
    }
    for (const [label, list] of byDay) groups.push({ key: label, label, entries: list });
  } else if (live.length > 0) {
    groups.push({ key: "all", label: null, entries: live });
  }
  return { groups, gone };
}

export function RecentlyDeletedModal({ open, onClose }: Props) {
  const notify = useRuforgeStore((s) => s.notify);
  const fetchEntries = useRuforgeStore((s) => s.fetchEntries);
  const [entries, setEntries] = useState<RecentlyDeletedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; kind: BusyKind } | null>(null);
  const [sort, setSort] = useState<VaultSort>("newest");
  const [goneOpen, setGoneOpen] = useState(false);
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
        return list.find((e) => e.recoverable)?.id ?? list[0]?.id ?? null;
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
      setGoneOpen(false);
    }
  }, [open, refresh]);

  const { groups, gone } = useMemo(() => buildGroups(entries, sort), [entries, sort]);
  const ordered = useMemo(
    () => [...groups.flatMap((g) => g.entries), ...(goneOpen ? gone : [])],
    [groups, gone, goneOpen],
  );

  const toggleGone = () => {
    if (goneOpen && selectedId && gone.some((e) => e.id === selectedId)) {
      setSelectedId(groups[0]?.entries[0]?.id ?? null);
    }
    setGoneOpen((v) => !v);
  };

  const forgetAllGone = async () => {
    if (busy !== null || gone.length === 0) return;
    setBusy({ id: "gone", kind: "forget" });
    const ids = new Set(gone.map((e) => e.id));
    try {
      for (const id of ids) await removeRecentlyDeletedEntry(id);
      setEntries((prev) => prev.filter((e) => !ids.has(e.id)));
      if (selectedId && ids.has(selectedId)) setSelectedId(groups[0]?.entries[0]?.id ?? null);
      setGoneOpen(false);
    } catch (e) {
      console.error(e);
      notify("Could not remove entries.", "error");
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const recoverableCount = entries.filter((e) => e.recoverable).length;
  const isBusy = busy !== null;

  const removeFromList = (removedId: string) => {
    const idx = ordered.findIndex((e) => e.id === removedId);
    const rest = ordered.filter((e) => e.id !== removedId);
    setSelectedId((rest[idx] ?? rest[idx - 1] ?? rest[0])?.id ?? null);
    setEntries((prev) => prev.filter((e) => e.id !== removedId));
  };

  const handleRestore = async (entry: RecentlyDeletedEntry) => {
    if (!entry.recoverable || isBusy) return;
    setBusy({ id: entry.id, kind: "restore" });
    try {
      const result = await restoreRecentlyDeleted(entry.id);
      if (result.restored) {
        await new Promise((r) => setTimeout(r, 380));
        removeFromList(entry.id);
        notify("Restored to your library.");
        void fetchEntries({
          manageLoadingStart: false,
          skipPosterBackfill: true,
          skipScrubBackfill: true,
        });
      } else if (!result.recoverable) {
        notify(`Files are no longer in the system ${systemTrashName()}.`, "warning");
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

  const restoreRef = useRef(handleRestore);
  restoreRef.current = handleRestore;
  // Stable identity keeps memoized cards from re-rendering, and re-measuring their layout, on every modal render.
  const onCardRestore = useCallback((entry: RecentlyDeletedEntry) => void restoreRef.current(entry), []);

  const handleDismiss = async (entry: RecentlyDeletedEntry) => {
    if (isBusy) return;
    setBusy({ id: entry.id, kind: "forget" });
    try {
      await removeRecentlyDeletedEntry(entry.id);
      removeFromList(entry.id);
    } catch (e) {
      console.error(e);
      notify("Could not remove entry.", "error");
    } finally {
      setBusy(null);
    }
  };

  const footer =
    entries.length > 0 ? (
      <>
        {selected ? (
          <SettingsModalBtnSecondary disabled={isBusy} onClick={() => void handleDismiss(selected)}>
            {busy?.id === selected.id && busy.kind === "forget" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" />
                Forgetting…
              </span>
            ) : (
              "Forget"
            )}
          </SettingsModalBtnSecondary>
        ) : null}
        {selected?.recoverable ? (
          <SettingsModalBtnPrimary disabled={isBusy} onClick={() => void handleRestore(selected)} className="gap-2">
            {busy?.id === selected.id && busy.kind === "restore" ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Restoring…
              </>
            ) : (
              <>
                <Undo2 size={13} strokeWidth={2.75} aria-hidden />
                Restore
              </>
            )}
          </SettingsModalBtnPrimary>
        ) : null}
      </>
    ) : undefined;

  return (
    <SettingsModalShell
      open={open}
      onClose={onClose}
      titleId="recently-deleted-title"
      eyebrow={null}
      title="Recently deleted"
      description={`Restore an item to your library while its files are still in the ${systemTrashName()}.`}
      zIndexClass="z-[120]"
      maxWidthClass="max-w-[min(90vw,60rem)]"
      maxHeightClass="max-h-[min(88vh,48rem)]"
      bezel
      bodyScrollInsetTop={entries.length > 0 ? TOOLBAR_H : undefined}
      bodyClassName="pt-0 pb-3"
      footerClassName="pb-4 pt-3"
      disableDismiss={isBusy}
      footer={footer}
    >
      {loading && entries.length === 0 ? (
        <div className="flex min-h-[12rem] items-center justify-center text-stone-500">
          <Loader2 size={20} className="animate-spin text-[color:var(--accent)]" aria-label="Loading" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-14 text-center text-[13px] text-stone-500">
          nothing here. deleted videos show up until you restore or forget them.
        </p>
      ) : (
        <>
          <VaultToolbar
            total={entries.length}
            recoverable={recoverableCount}
            sort={sort}
            onSort={setSort}
          />
          <div role="listbox" aria-label="Deleted items" className="flex flex-col gap-5 pt-3">
            {groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                {group.label ? (
                  <h3 className="px-1.5 text-[12px] font-semibold text-stone-400">{group.label}</h3>
                ) : null}
                <div className={VAULT_GRID}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {group.entries.map((entry, index) => (
                      <VaultCard
                        key={entry.id}
                        index={index}
                        entry={entry}
                        selected={entry.id === selectedId}
                        busyKind={busy?.id === entry.id ? busy.kind : null}
                        locked={isBusy && busy?.id !== entry.id}
                        onSelect={setSelectedId}
                        onRestore={onCardRestore}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
            {gone.length > 0 ? (
              <GoneSection
                entries={gone}
                open={goneOpen}
                onToggle={toggleGone}
                onForgetAll={() => void forgetAllGone()}
                forgettingAll={busy?.id === "gone"}
                locked={isBusy}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRestore={onCardRestore}
              />
            ) : null}
          </div>
        </>
      )}
    </SettingsModalShell>
  );
}

function VaultToolbar({
  total,
  recoverable,
  sort,
  onSort,
}: {
  total: number;
  recoverable: number;
  sort: VaultSort;
  onSort: (sort: VaultSort) => void;
}) {
  const { sentinelRef, stuck } = useStuckHeader();
  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div className="sticky top-0 z-10 -mx-6 bg-[#1D1613] px-6">
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-[#271C18] transition-opacity duration-200 motion-reduce:transition-none",
            stuck ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="relative flex items-center justify-between gap-3 px-1.5" style={{ height: TOOLBAR_H }}>
          <p className="truncate text-[12px] tabular-nums text-stone-500">
            <span className="font-semibold text-stone-200">{total}</span> {total === 1 ? "item" : "items"}
            {recoverable < total ? (
              <>
                {" · "}
                <span className="font-semibold text-stone-200">{recoverable}</span> recoverable
              </>
            ) : null}
          </p>
          <div role="radiogroup" aria-label="Sort" className="flex shrink-0 items-center rounded-lg bg-[#271C18] p-0.5">
            {SORTS.map((s) => {
              const active = s.key === sort;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSort(s.key)}
                  className={cn(
                    "relative rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
                    active ? "text-stone-100" : "text-stone-500 hover:text-stone-200",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="rf-vault-sort"
                      aria-hidden
                      className="absolute inset-0 rounded-md bg-[#3a2c25]"
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    />
                  ) : null}
                  <span className="relative">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function GoneSection({
  entries,
  open,
  onToggle,
  onForgetAll,
  forgettingAll,
  locked,
  selectedId,
  onSelect,
  onRestore,
}: {
  entries: RecentlyDeletedEntry[];
  open: boolean;
  onToggle: () => void;
  onForgetAll: () => void;
  forgettingAll: boolean;
  locked: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRestore: (entry: RecentlyDeletedEntry) => void;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-[#241b17] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[#2a201b]"
        >
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="flex shrink-0 text-stone-500"
          >
            <ChevronDown size={15} strokeWidth={2.5} />
          </motion.span>
          <span className="truncate text-[13px] font-medium text-stone-300">
            No longer in the {systemTrashName()}
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-stone-500">{entries.length}</span>
          <span className="ml-auto hidden shrink-0 text-[11px] text-stone-600 sm:inline">Can't be restored</span>
        </button>
        <SettingsModalBtnSecondary disabled={locked} onClick={onForgetAll}>
          {forgettingAll ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" />
              Forgetting…
            </span>
          ) : (
            "Forget all"
          )}
        </SettingsModalBtnSecondary>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="gone-grid"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-2 gap-y-3 pt-3">
              <AnimatePresence mode="popLayout">
                {entries.map((entry, index) => (
                  <VaultCard
                    key={entry.id}
                    index={index}
                    entry={entry}
                    selected={entry.id === selectedId}
                    busyKind={null}
                    locked={locked}
                    onSelect={onSelect}
                    onRestore={onRestore}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const VaultCard = memo(function VaultCard({
  index,
  entry,
  selected,
  busyKind,
  locked,
  onSelect,
  onRestore,
}: {
  index: number;
  entry: RecentlyDeletedEntry;
  selected: boolean;
  busyKind: BusyKind | null;
  locked: boolean;
  onSelect: (id: string) => void;
  onRestore: (entry: RecentlyDeletedEntry) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const restoring = busyKind === "restore";
  const thumb = entry.previewPath && !thumbFailed ? convertFileSrc(entry.previewPath) : null;
  const gone = !entry.recoverable;

  return (
    <motion.div
      layout
      role="option"
      tabIndex={locked ? -1 : 0}
      aria-selected={selected}
      aria-disabled={locked}
      onClick={() => !locked && onSelect(entry.id)}
      onDoubleClick={() => !locked && !gone && onRestore(entry)}
      onKeyDown={(e) => {
        if (locked) return;
        if (e.key === "Enter" && !gone) onRestore(entry);
        else if (e.key === " ") {
          e.preventDefault();
          onSelect(entry.id);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2, ease: EASE } }}
      transition={{
        duration: 0.3,
        ease: EASE,
        delay: Math.min(index, 8) * 0.04,
        layout: { duration: 0.28, ease: EASE },
      }}
      className={cn(
        "group flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl p-1.5 outline-none transition-colors duration-150 focus-visible:bg-white/[0.06]",
        selected ? "bg-[#2e241f]" : "hover:bg-white/[0.04]",
        locked && "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-lg bg-[#261d18] transition-opacity duration-150",
          restoring && "opacity-60",
        )}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setThumbFailed(true)}
            className={cn("h-full w-full object-cover", gone && "opacity-40 grayscale")}
          />
        ) : (
          <Video size={20} className="absolute inset-0 m-auto text-stone-600" aria-hidden />
        )}
        {entry.sizeBytes ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-100">
            {formatStorageSize(entry.sizeBytes)}
          </span>
        ) : null}
        {!gone ? (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity duration-150",
              hovered || restoring ? "opacity-100" : "opacity-0",
            )}
          >
            <button
              type="button"
              tabIndex={-1}
              data-tooltip="Restore"
              aria-label={`Restore ${entry.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onRestore(entry);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent)] text-[#1D1613] transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              {restoring ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <Undo2 size={15} strokeWidth={2.75} aria-hidden />
              )}
            </button>
          </div>
        ) : null}
      </div>
      <div className="min-w-0 px-0.5 pb-0.5">
        <HoverMarqueeText
          text={entry.title}
          active={hovered}
          className={cn("text-[13px] font-medium", gone ? "text-stone-500" : "text-stone-100")}
        />
        <p className="mt-0.5 truncate text-[11px] tabular-nums text-stone-500">
          {formatDeletedTime(entry.deletedAt)}
        </p>
      </div>
    </motion.div>
  );
});

function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

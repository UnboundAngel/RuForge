import { useEffect, useMemo, useState, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { X, Video, Trash2, CheckSquare, Square, Loader2 } from "lucide-react";
import { useRuforgeStore } from "../store/ruforgeStore";
import {
  buildCleanupCandidates,
  bytesToFreeForHeadroom,
  clearPlaybackStateForDeletedPaths,
  defaultSelectedPaths,
  formatBytes,
  type CleanupFilterMode,
  type CleanupCandidate,
} from "../cleanupCandidates";

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
          <div className="w-10 h-10 rounded-full bg-[color:var(--accent)] text-[#110D0B] flex items-center justify-center shadow-2xl">
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
            <div className="h-full bg-[color:var(--accent)] shadow-[0_0_10px_var(--accent-glow)]" style={{ width: `${c.watchProgressPct}%` }} />
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
  const limitGB = useRuforgeStore((s) => s.settings.storageLimitGB);
  const storageStats = useRuforgeStore((s) => s.storageStats);
  const notify = useRuforgeStore((s) => s.notify);
  const refreshStorageStats = useRuforgeStore((s) => s.refreshStorageStats);
  const invalidateEntries = useRuforgeStore((s) => s.invalidateEntries);

  const [mode, setMode] = useState<CleanupFilterMode>("oldest_unwatched");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [showDeselectWarning, setShowDeselectWarning] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
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
      if (isMounted.current) {
        notify(`Freed ${formatBytes(deleted)} from your library.`);
        close();
      }
    } catch (e) {
      console.error(e);
      if (isMounted.current) notify("Cleanup failed.", "error");
    } finally {
      if (isMounted.current) setBusy(false);
    }
  };

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const isScrolled = e.currentTarget.scrollTop > 20;
    setScrolled((prev) => prev !== isScrolled ? isScrolled : prev);
  }, []);

  const shortfall =
    bytesNeeded !== null && bytesNeeded > 0 && selectedBytes < bytesNeeded ? bytesNeeded - selectedBytes : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex flex-col bg-[#110D0B] text-stone-100 selection:bg-[color:var(--accent)] selection:text-[#110D0B]"
          role="dialog"
          aria-modal="true"
        >
          {/* Combined Slim Header & Drag Region */}
          <div 
            className="h-16 w-full flex-shrink-0 flex items-center justify-between px-10 border-b border-white/5 pointer-events-auto bg-black/20"
            data-tauri-drag-region
          >
            <div className="flex items-center gap-8 pointer-events-none">
              <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-stone-200">
                Internal Storage
              </h2>
              
              <div className="h-4 w-px bg-white/10" />
              
              <LayoutGroup id="cleanup-filters">
                <div className="flex items-center gap-1 pointer-events-auto">
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
                        onClick={() => onModeChange(value)}
                        className={`relative px-5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${isActive ? 'text-[#110D0B]' : 'text-stone-500 hover:text-stone-300'}`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="filter-bg"
                            className="absolute inset-0 bg-[color:var(--accent)] rounded-full z-0"
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

            <div className="flex items-center gap-8 pointer-events-auto">
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black uppercase tracking-widest text-stone-600">Goal Progress</span>
                  {bytesNeeded === null ? (
                    <Loader2 size={10} className="animate-spin text-stone-700" />
                  ) : (
                    <span className={`text-[10px] font-black tracking-widest transition-colors ${shortfall === 0 ? 'text-[color:var(--accent)]' : 'text-stone-400'}`}>
                      {formatBytes(selectedBytes)} / {formatBytes(bytesNeeded)}
                    </span>
                  )}
                </div>
                {/* Visual Goal Bar */}
                <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={false}
                    animate={{ 
                      width: bytesNeeded === null ? "0%" : `${Math.min(100, (selectedBytes / bytesNeeded) * 100)}%`,
                      backgroundColor: shortfall === 0 && bytesNeeded !== null ? 'var(--accent)' : '#444'
                    }}
                    className="h-full"
                  />
                </div>
              </div>
              <button
                onClick={close}
                className="w-10 h-10 flex items-center justify-center rounded-full text-stone-400 hover:text-white transition-colors"
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
                borderBottomWidth: scrolled ? 0 : 1
              }}
              className="flex items-center justify-between px-10 bg-white/[0.02] border-b border-white/5 relative z-10 overflow-hidden"
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
              className="flex-1 overflow-y-auto p-10 scrollbar-none relative z-10"
              onScroll={handleScroll}
            >
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
            </div>
          </div>

          {/* Slim Integrated Footer */}
          <div className="h-24 w-full flex-shrink-0 flex items-center justify-between px-12 border-t border-white/5 bg-gradient-to-b from-transparent to-black/60 backdrop-blur-xl relative z-20">
            <div className="flex items-center gap-14">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-stone-600">Selection</span>
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
                  className="flex items-center gap-3 px-5 py-2.5 bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/60">
                    Need {formatBytes(shortfall)} more
                  </span>
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={close}
                className="px-8 py-3 text-[11px] font-black uppercase tracking-[0.3em] text-stone-500 hover:text-stone-100 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={busy || selected.size === 0}
                onClick={() => void handleConfirm()}
                className={`h-12 px-10 rounded-full text-[10px] font-black uppercase tracking-0.4em transition-all shadow-xl ${busy || selected.size === 0 ? 'bg-stone-800 text-stone-600 opacity-30 cursor-not-allowed' : 'bg-[color:var(--accent)] text-[#110D0B] active:scale-95'}`}
              >
                {busy ? "Deleting…" : "Delete Selected"}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

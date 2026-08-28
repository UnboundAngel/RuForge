import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Clock, ListPlus, ListVideo, Plus, X } from "lucide-react";
import { useRuforgeStore } from "../store/ruforgeStore";
import {
  WATCH_LATER_ID,
  sortVirtualRecords,
  type VirtualPlaylistRecord,
} from "../virtualPlaylists";
import { mediaPathsMatch } from "../lib/mediaPathMatch";
import { OVERLAY_Z_CLASS } from "../lib/overlayZIndex";
import {
  overlayFadeTransition,
  overlayPanelTransition,
  motionDuration,
} from "../lib/overlayMotion";
import { MORPH_SPRING } from "./ui/Morph";
import { cn } from "../lib/utils";

/** Bezel plate face — soft accent bloom through RuForge brown (no conic rays). */
const BEZEL_SWIRL = {
  backgroundColor: "#271C18",
  backgroundImage: `
    radial-gradient(
      ellipse 95% 70% at 12% 8%,
      color-mix(in srgb, var(--accent) 22%, transparent) 0%,
      transparent 62%
    ),
    radial-gradient(
      ellipse 75% 55% at 92% 88%,
      color-mix(in srgb, var(--accent) 14%, transparent) 0%,
      transparent 58%
    ),
    radial-gradient(
      ellipse 55% 45% at 62% 38%,
      color-mix(in srgb, var(--accent) 8%, transparent) 0%,
      transparent 70%
    ),
    linear-gradient(
      148deg,
      #2c211c 0%,
      #271C18 48%,
      #1e1612 100%
    )
  `,
} as const;

export function SaveToPlaylistModal({
  open,
  onClose,
  mediaPaths,
}: {
  open: boolean;
  onClose: () => void;
  mediaPaths: string[];
}) {
  const notify = useRuforgeStore((s) => s.notify);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const createVirtualPlaylist = useRuforgeStore((s) => s.createVirtualPlaylist);
  const listVirtualPlaylistRecords = useRuforgeStore(
    (s) => s.listVirtualPlaylistRecords,
  );
  const libraryScanRevision = useRuforgeStore((s) => s.libraryScanRevision);

  const reduceMotion = useReducedMotion();
  const fade = motionDuration(reduceMotion, overlayFadeTransition);
  const panel = motionDuration(reduceMotion, overlayPanelTransition);
  const spring = reduceMotion ? { duration: 0 } : MORPH_SPRING;

  const [records, setRecords] = useState<VirtualPlaylistRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dismissReady, setDismissReady] = useState(false);
  const [drawerH, setDrawerH] = useState(0);
  const drawerContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setDismissReady(false);
      setDrawerH(0);
      return;
    }
    setRecords(sortVirtualRecords(listVirtualPlaylistRecords()));
    setCreating(false);
    setNewTitle("");
  }, [open, listVirtualPlaylistRecords, libraryScanRevision]);

  const rows = useMemo(() => {
    return records.map((r) => {
      const already =
        mediaPaths.length > 0 &&
        mediaPaths.every((p) => r.items.some((i) => mediaPathsMatch(i.path, p)));
      return { record: r, already };
    });
  }, [records, mediaPaths]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = drawerContentRef.current;
    if (!el) return;
    const next = Math.ceil(el.getBoundingClientRect().height);
    setDrawerH((prev) => (prev === next ? prev : Math.max(next, 1)));
  }, [open, creating, rows, newTitle]);

  const handlePick = (id: string) => {
    if (mediaPaths.length === 0) {
      onClose();
      return;
    }
    addToVirtualPlaylist(id, mediaPaths);
    const title =
      records.find((r) => r.id === id)?.title ??
      (id === WATCH_LATER_ID ? "Watch later" : "Playlist");
    notify(`Added to ${title}`);
    onClose();
  };

  const handleCreate = () => {
    const title = newTitle.trim() || "Playlist";
    createVirtualPlaylist(title, mediaPaths);
    notify(`Created "${title}"`);
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="save-to-playlist"
          className={`fixed inset-0 ${OVERLAY_Z_CLASS.confirm} flex items-center justify-center bg-black/80 p-4`}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          onAnimationComplete={() => setDismissReady(true)}
        >
          <button
            type="button"
            className={cn(
              "absolute inset-0 cursor-default",
              !dismissReady && "pointer-events-none",
            )}
            aria-label="Close dialog"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-to-playlist-title"
            className="relative w-full max-w-[22rem] overflow-hidden rounded-[24px] shadow-[0_28px_72px_rgba(0,0,0,0.55)]"
            style={BEZEL_SWIRL}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={panel}
          >
            {/* Bezel plate: header + gutter around the drawer well */}
            <div className="px-4 pt-4">
              <div className="flex items-start justify-between gap-3">
                <ListPlus
                  size={18}
                  className="text-[color:var(--accent)] mt-0.5 shrink-0"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1 text-stone-500 transition-colors hover:text-stone-200"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={creating ? "create-copy" : "save-copy"}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: reduceMotion ? 0 : 0.16 }}
                  className="mt-2 mb-1"
                >
                  {creating ? (
                    <>
                      <h2
                        id="save-to-playlist-title"
                        className="text-[1.35rem] font-bold tracking-[-0.02em] text-white leading-tight"
                      >
                        New playlist
                      </h2>
                      <p className="mt-1.5 text-[12px] font-medium leading-snug text-stone-500">
                        Name it. Add videos from the library anytime.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2
                        id="save-to-playlist-title"
                        className="text-[15px] font-semibold text-stone-100 leading-snug"
                      >
                        Save to playlist
                      </h2>
                      <p className="mt-1 text-[11px] leading-snug text-stone-500">
                        Pick a list or start a new one.
                      </p>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/*
              Drawer = darker well carved into the bezel. Bezel gutter is the
              bevel around it. Fill only — no stroke, no accent ring.
            */}
            <div className="px-2.5 pb-2.5 pt-3">
              <motion.div
                className="overflow-hidden rounded-[16px] bg-[#1D1613]"
                initial={false}
                animate={drawerH > 0 ? { height: drawerH } : undefined}
                transition={spring}
              >
                <div ref={drawerContentRef} className="px-2.5 pt-2.5 pb-2.5">
                  {creating ? (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Playlist name"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreate();
                        }}
                        className="w-full rounded-xl bg-[#261d18] px-3.5 py-2.5 text-[15px] font-medium text-stone-100 outline-none placeholder:text-stone-600 placeholder:font-normal focus:bg-[#2c221d] transition-colors"
                      />
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setCreating(false)}
                          className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400 hover:text-stone-200 transition-colors active:scale-[0.98]"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={handleCreate}
                          className="px-4 py-2 rounded-xl bg-[color:var(--accent)] text-[10px] font-black uppercase tracking-[0.18em] text-[#1D1613] hover:brightness-105 transition-[filter,transform] active:scale-[0.98]"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => setCreating(true)}
                          className="group w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-[background-color,transform] duration-150 hover:bg-white/[0.06] active:scale-[0.99]"
                        >
                          <div className="w-9 h-9 rounded-lg bg-[color-mix(in_srgb,var(--accent),transparent_88%)] flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105">
                            <Plus size={15} className="text-[color:var(--accent)]" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-stone-100">
                              New playlist
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              Create a named pile
                            </div>
                          </div>
                        </button>

                        {rows.map(({ record, already }) => {
                          const isWatchLater = record.id === WATCH_LATER_ID;
                          const count = record.items.length;
                          return (
                            <button
                              key={record.id}
                              type="button"
                              disabled={already}
                              onClick={() => handlePick(record.id)}
                              className="group w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-[background-color,transform,opacity] duration-150 hover:bg-white/[0.06] active:scale-[0.99] disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                            >
                              <div className="w-9 h-9 rounded-lg bg-[#261d18] flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 group-disabled:group-hover:scale-100">
                                {isWatchLater ? (
                                  <Clock size={15} className="text-stone-400" strokeWidth={1.75} />
                                ) : (
                                  <ListVideo size={15} className="text-stone-400" strokeWidth={1.75} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-semibold text-stone-100 truncate">
                                  {record.title}
                                </div>
                                <div className="text-[11px] text-stone-500 mt-0.5">
                                  {already
                                    ? "Already added"
                                    : `${count} video${count === 1 ? "" : "s"}`}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex justify-end mt-1">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_88%)] transition-colors active:scale-[0.98]"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

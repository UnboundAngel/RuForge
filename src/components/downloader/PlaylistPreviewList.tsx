import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Search, X } from "lucide-react";

import { keysInRange } from "../../lib/playlistPreviewState";
import { DRAG_OVERLAY_Z } from "../../lib/overlayZIndex";
import { usePlaylistRowFlip } from "./usePlaylistRowFlip";
import "./playlistPreview.css";

const SWAP_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const DROP_ANIMATION: DropAnimation = {
  duration: 260,
  easing: SWAP_EASE,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.3" } } }),
};

export type PlaylistRowControls = {
  /** Position among the kept rows, which is the number the file gets. Null for cancelled rows. */
  number: number | null;
  excluded: boolean;
  /** Shift-click cancels or restores everything from the last clicked row. */
  onToggleExcluded: (e: MouseEvent) => void;
};

function SortableSlot({
  id,
  flipKey,
  children,
}: {
  id: string;
  flipKey: string;
  children: ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: { duration: 260, easing: SWAP_EASE },
  });
  return (
    <div
      ref={setNodeRef}
      data-flip-key={flipKey}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`cursor-grab touch-none ${isDragging ? "opacity-30" : ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

type Entry<T> = { item: T; index: number; key: string; id: string; title: string };

/**
 * Playlist rows with drag-to-reorder, per-row cancel (shift-click for a range) and a search box.
 * Cancelled rows drop to a dimmed tail so the kept rows stay numbered 1..N like the files.
 * Row keys must be unique per row, so repeated videos get an occurrence suffix.
 */
export function PlaylistPreviewList<T>({
  items,
  itemKey,
  itemTitle,
  renderRow,
  onReorder,
  disabled,
  className,
  gridClassName,
  excluded,
  anchor,
  onSetExcluded,
  listing,
}: {
  items: T[];
  /** `index` is 1-based, matching the download plan's row keys. */
  itemKey: (item: T, index: number) => string;
  itemTitle: (item: T) => string;
  renderRow: (item: T, index: number, lifted: boolean, controls: PlaylistRowControls) => ReactNode;
  onReorder: (from: number, to: number) => void;
  disabled: boolean;
  className: string;
  gridClassName: string;
  excluded?: ReadonlySet<string>;
  anchor?: string | null;
  onSetExcluded?: (keys: string[], excluded: boolean, anchor: string | null) => void;
  listing?: boolean;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const armFlip = usePlaylistRowFlip(scrollRef, reduceMotion);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const entries = useMemo<Entry<T>[]>(() => {
    const seen = new Map<string, number>();
    return items.map((item, index) => {
      const key = itemKey(item, index + 1);
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      return { item, index, key, id: n === 0 ? key : `${key}#${n}`, title: itemTitle(item) };
    });
  }, [items, itemKey, itemTitle]);

  const canCancel = !disabled && onSetExcluded != null;
  const isCut = (e: Entry<T>) => canCancel && excluded?.has(e.key) === true;
  const kept = entries.filter((e) => !isCut(e));
  const cut = entries.filter(isCut);
  const numberOf = useMemo(() => {
    const map = new Map<string, number>();
    kept.forEach((e, i) => map.set(e.id, i + 1));
    return map;
  }, [kept]);

  const needle = query.trim().toLowerCase();
  const matches = (e: Entry<T>) => !needle || e.title.toLowerCase().includes(needle);
  const shownKept = kept.filter(matches);
  const shownCut = cut.filter(matches);
  const searching = needle.length > 0;
  const orderedKeys = [...shownKept, ...shownCut].map((e) => e.key);

  const controlsFor = (e: Entry<T>): PlaylistRowControls => ({
    number: numberOf.get(e.id) ?? null,
    excluded: isCut(e),
    onToggleExcluded: (ev) => {
      if (!onSetExcluded) return;
      const nextExcluded = !isCut(e);
      const keys = ev.shiftKey ? keysInRange(orderedKeys, anchor ?? null, e.key) : [e.key];
      armFlip();
      onSetExcluded(keys, nextExcluded, e.key);
    },
  });

  const slot = (e: Entry<T>, lifted = false) =>
    renderRow(e.item, e.index, lifted, controlsFor(e));

  const sortable = !disabled && !searching;
  const activeEntry = activeId ? kept.find((e) => e.id === activeId) : undefined;

  const handleDragStart = (ev: DragStartEvent) => setActiveId(String(ev.active.id));
  const handleDragEnd = (ev: DragEndEvent) => {
    setActiveId(null);
    if (!ev.over || ev.active.id === ev.over.id) return;
    const from = kept.find((e) => e.id === String(ev.active.id));
    const to = kept.find((e) => e.id === String(ev.over!.id));
    if (from && to) onReorder(from.index, to.index);
  };

  const keptGrid = sortable ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={kept.map((e) => e.id)} strategy={rectSortingStrategy}>
        <div className={gridClassName}>
          {kept.map((e) => (
            <SortableSlot key={e.id} id={e.id} flipKey={e.id}>
              {slot(e)}
            </SortableSlot>
          ))}
        </div>
      </SortableContext>
      {createPortal(
        <DragOverlay dropAnimation={DROP_ANIMATION} zIndex={DRAG_OVERLAY_Z}>
          {activeEntry ? (
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 520, damping: 32 }}
              className="cursor-grabbing rounded-[24px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
            >
              {slot(activeEntry, true)}
            </motion.div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  ) : (
    <div className={gridClassName}>
      {shownKept.map((e) => (
        <div key={e.id} data-flip-key={e.id}>
          {slot(e)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto mt-6 w-full max-w-4xl px-4 sm:mt-10">
      {canCancel && items.length > 1 && (
        <label className="mb-2 flex h-9 items-center gap-2 rounded-full bg-[color:var(--rf-well-raised)] px-3.5 text-stone-400 focus-within:text-stone-200">
          <Search size={14} strokeWidth={2.5} aria-hidden />
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="Search this playlist"
            aria-label="Search this playlist"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-stone-100 outline-none placeholder:text-stone-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              data-tooltip="Clear search"
              className="grid h-5 w-5 place-items-center rounded-full text-stone-400 hover:text-white"
            >
              <X size={12} strokeWidth={2.75} />
            </button>
          )}
        </label>
      )}
      <div ref={scrollRef} className={`relative ${className}`}>
        {keptGrid}
        {shownCut.length > 0 && (
          <div className={`${gridClassName} mt-1`}>
            {shownCut.map((e) => (
              <div key={e.id} data-flip-key={e.id} data-flip-dim="1" className="opacity-[0.42]">
                {slot(e)}
              </div>
            ))}
          </div>
        )}
        {searching && shownKept.length + shownCut.length === 0 && (
          <p className="py-6 text-center text-[11px] font-semibold text-stone-500">
            No videos match
          </p>
        )}
        {listing && (
          <p
            role="status"
            className="rf-text-shimmer py-3 text-center text-[10px] font-black uppercase tracking-[0.25em] text-stone-500"
          >
            Loading more videos
          </p>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
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

import { DRAG_OVERLAY_Z } from "../../lib/overlayZIndex";

const SWAP_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const DROP_ANIMATION: DropAnimation = {
  duration: 260,
  easing: SWAP_EASE,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.3" } } }),
};

function SortableSlot({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    transition: { duration: 260, easing: SWAP_EASE },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`cursor-grab touch-none ${isDragging ? "opacity-30" : ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/**
 * Drag-to-reorder grid for the playlist hero. Ids must be unique per row, so repeated videos get an
 * occurrence suffix.
 */
export function PlaylistPreviewList<T>({
  items,
  itemKey,
  renderRow,
  onReorder,
  disabled,
  className,
}: {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number, lifted: boolean) => ReactNode;
  onReorder: (from: number, to: number) => void;
  disabled: boolean;
  className: string;
}) {
  const ids = useMemo(() => {
    const seen = new Map<string, number>();
    return items.map((item, i) => {
      const base = itemKey(item, i);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n === 0 ? base : `${base}#${n}`;
    });
  }, [items, itemKey]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (disabled) {
    return <div className={className}>{items.map((item, i) => renderRow(item, i, false))}</div>;
  }

  const activeIndex = activeId ? ids.indexOf(activeId) : -1;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onReorder(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item, i) => (
            <SortableSlot key={ids[i]} id={ids[i]!}>
              {renderRow(item, i, false)}
            </SortableSlot>
          ))}
        </div>
      </SortableContext>
      {createPortal(
        <DragOverlay dropAnimation={DROP_ANIMATION} zIndex={DRAG_OVERLAY_Z}>
          {activeIndex >= 0 ? (
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 520, damping: 32 }}
              className="cursor-grabbing rounded-[24px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
            >
              {renderRow(items[activeIndex]!, activeIndex, true)}
            </motion.div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

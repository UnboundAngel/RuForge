import { useMemo, useRef } from "react";
import { Trash2 } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { DevCaptureEntry } from "../../lib/devCapturesTypes";

const DRAG_SLOP_PX = 6;

type DevCaptureThumbProps = {
  entry: DevCaptureEntry;
  previewRev: number;
  selected: boolean;
  onSelect: (path: string, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onDelete: (path: string) => void;
  onAnnotate: (path: string) => void;
  selectedPaths: string[];
};

export function DevCaptureThumb({
  entry,
  previewRev,
  selected,
  onSelect,
  onDelete,
  onAnnotate,
  selectedPaths,
}: DevCaptureThumbProps) {
  const dragStartedRef = useRef(false);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);

  const thumbSrc = useMemo(
    () => `${convertFileSrc(entry.path)}?v=${entry.modifiedMs}-${previewRev}`,
    [entry.path, entry.modifiedMs, previewRev],
  );

  const resetPointer = () => {
    pointerOriginRef.current = null;
    dragStartedRef.current = false;
  };

  const pathsForDrag = () => {
    if (selectedPaths.length > 0 && selectedPaths.includes(entry.path)) {
      return selectedPaths;
    }
    return [entry.path];
  };

  return (
    <div
      className={`group relative aspect-video cursor-default overflow-hidden rounded-[var(--radius-input)] ${
        selected ? "ring-2 ring-[color:var(--accent)]" : "ring-1 ring-white/10"
      }`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("[data-rf-capture-trash]")) return;
        pointerOriginRef.current = { x: e.clientX, y: e.clientY };
        dragStartedRef.current = false;
      }}
      onPointerMove={(e) => {
        if (dragStartedRef.current || !pointerOriginRef.current) return;
        const dx = e.clientX - pointerOriginRef.current.x;
        const dy = e.clientY - pointerOriginRef.current.y;
        if (Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
        dragStartedRef.current = true;
        void invoke("start_dev_capture_file_drag", { paths: pathsForDrag() }).catch((err) => {
          console.error("[dev-captures] drag failed", err);
        });
      }}
      onPointerUp={resetPointer}
      onPointerCancel={resetPointer}
      onClick={(e) => {
        if (dragStartedRef.current) return;
        onSelect(entry.path, {
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        });
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        onAnnotate(entry.path);
      }}
    >
      <img
        src={thumbSrc}
        alt={entry.name}
        className="h-full w-full object-cover"
        draggable={false}
      />
      <button
        type="button"
        data-rf-capture-trash
        title="Delete"
        className="absolute right-1 top-1 z-10 rounded-md bg-black/60 p-1 text-stone-200 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry.path);
        }}
      >
        <Trash2 size={14} strokeWidth={2} />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
        <p className="truncate text-[10px] font-medium text-stone-200">{entry.name}</p>
      </div>
    </div>
  );
}

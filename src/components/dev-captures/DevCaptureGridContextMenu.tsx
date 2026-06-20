import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { ClipboardCopy, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DevCaptureGridContextMenuState = {
  x: number;
  y: number;
};

const ROW =
  "flex items-center gap-2 w-full px-3 h-9 text-[13px] text-[#c0c0c0] hover:text-white hover:bg-white/[0.07] border-0 outline-none text-left cursor-pointer transition-colors duration-100";

const ROW_DANGER =
  "flex items-center gap-2 w-full px-3 h-9 text-[13px] text-red-400/90 hover:text-red-300 hover:bg-red-500/10 border-0 outline-none text-left cursor-pointer transition-colors duration-100";

type Props = {
  menu: DevCaptureGridContextMenuState | null;
  selectedCount: number;
  onAnnotate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onClose: () => void;
};

export function DevCaptureGridContextMenu({
  menu,
  selectedCount,
  onAnnotate,
  onCopy,
  onDelete,
  onClearSelection,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const multi = selectedCount > 1;

  useEffect(() => {
    if (!menu) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle, { capture: true });
    return () => document.removeEventListener("mousedown", handle, { capture: true });
  }, [menu, onClose]);

  useEffect(() => {
    if (!menu) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [menu, onClose]);

  if (!menu) return null;

  const left = Math.min(menu.x, window.innerWidth - 220);
  const top = Math.min(menu.y, window.innerHeight - (multi ? 96 : 132));

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.94, y: -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      style={{ position: "fixed", left, top, zIndex: 9999 }}
      className="w-48 bg-[#0f0f0f] border border-white/[0.11] rounded-[18px] shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {!multi ? (
        <>
          <button type="button" className={ROW} onClick={act(onAnnotate)}>
            <Pencil size={14} strokeWidth={2} />
            Annotate
          </button>
          <button type="button" className={ROW} onClick={act(onCopy)}>
            <ClipboardCopy size={14} strokeWidth={2} />
            Copy image
          </button>
          <button type="button" className={ROW_DANGER} onClick={act(onDelete)}>
            <Trash2 size={14} strokeWidth={2} />
            Delete
          </button>
        </>
      ) : (
        <>
          <button type="button" className={ROW_DANGER} onClick={act(onDelete)}>
            <Trash2 size={14} strokeWidth={2} />
            Delete {selectedCount} captures
          </button>
          <button type="button" className={cn(ROW, "text-stone-500")} onClick={act(onClearSelection)}>
            <X size={14} strokeWidth={2} />
            Clear selection
          </button>
        </>
      )}
    </motion.div>,
    document.body,
  );
}

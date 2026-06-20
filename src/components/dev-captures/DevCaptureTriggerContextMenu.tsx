import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Pencil, Images } from "lucide-react";
import { cn } from "@/lib/utils";

export type DevCaptureTriggerContextMenuState = {
  x: number;
  y: number;
};

const ROW =
  "flex items-center gap-2 w-full px-3 h-9 text-[13px] text-[#c0c0c0] hover:text-white hover:bg-white/[0.07] border-0 outline-none text-left cursor-pointer transition-colors duration-100";

type Props = {
  menu: DevCaptureTriggerContextMenuState | null;
  hasLastCapture: boolean;
  onEditLast: () => void;
  onOpenLibrary: () => void;
  onClose: () => void;
};

export function DevCaptureTriggerContextMenu({
  menu,
  hasLastCapture,
  onEditLast,
  onOpenLibrary,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const left = Math.min(menu.x, window.innerWidth - 200);
  const top = Math.min(menu.y, window.innerHeight - 96);

  return createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.94, y: -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -5 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      style={{ position: "fixed", left, top, zIndex: 9999 }}
      className="w-44 bg-[#0f0f0f] border border-white/[0.11] rounded-[18px] shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cn(ROW, !hasLastCapture && "opacity-40 cursor-not-allowed")}
        disabled={!hasLastCapture}
        onClick={() => {
          onEditLast();
          onClose();
        }}
      >
        <Pencil size={14} strokeWidth={2} />
        Edit last
      </button>
      <button type="button" className={ROW} onClick={() => { onOpenLibrary(); onClose(); }}>
        <Images size={14} strokeWidth={2} />
        Dev captures
      </button>
    </motion.div>,
    document.body,
  );
}

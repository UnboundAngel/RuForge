import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ListVideo, FolderOpen, User, Disc3 } from "lucide-react";

import type { MediaFile } from "@/types";
import { openInFileManager } from "@/openInFileManager";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { artistKeyFromFile } from "./musicArtist";

export type MusicRowContextMenuState = {
  file: MediaFile;
  x: number;
  y: number;
};

type Props = {
  menu: MusicRowContextMenuState | null;
  onClose: () => void;
};

export function MusicRowContextMenu({ menu, onClose }: Props) {
  const enqueueManualQueue = useRuforgeStore((s) => s.enqueueManualQueue);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const openMusicAlbum = useRuforgeStore((s) => s.openMusicAlbum);

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

  const file = menu.file;
  const hasAlbum = !!(file.album?.trim());
  const artistKey = artistKeyFromFile(file);
  const albumKey = (file.album ?? "").trim().toLowerCase();

  const left = Math.min(menu.x, window.innerWidth - 220);
  const top = Math.min(menu.y, window.innerHeight - 200);

  const item = "w-full px-3 h-[36px] flex items-center gap-[10px] hover:bg-white/5 transition-colors text-stone-300 hover:text-white rounded-lg text-[13px] border-0 outline-none text-left cursor-pointer";

  const portal = (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -6 }}
      transition={{ duration: 0.12 }}
      style={{ position: "fixed", left, top, zIndex: 9999 }}
      className="w-52 bg-stone-900/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl py-1.5 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={item}
        onClick={() => { enqueueManualQueue(file.path); onClose(); }}
      >
        <ListVideo size={14} />
        Add to queue
      </button>
      <button
        className={item}
        onClick={() => { void openInFileManager(file.path); onClose(); }}
      >
        <FolderOpen size={14} />
        Show in folder
      </button>

      <div className="my-1 mx-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />

      {artistKey && (
        <button
          className={item}
          onClick={() => { openMusicArtist(artistKey); onClose(); }}
        >
          <User size={14} />
          Go to artist
        </button>
      )}
      {hasAlbum && (
        <button
          className={item}
          onClick={() => { openMusicAlbum(artistKey, albumKey); onClose(); }}
        >
          <Disc3 size={14} />
          Go to album
        </button>
      )}
    </motion.div>
  );

  return createPortal(portal, document.body);
}

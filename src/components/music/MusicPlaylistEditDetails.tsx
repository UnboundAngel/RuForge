import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { MediaFile } from "@/types";
import { OVERLAY_Z_CLASS } from "@/lib/overlayZIndex";
import { PLAYLIST_DESCRIPTION_MAX } from "@/virtualPlaylists";
import { MusicPlaylistCover } from "./MusicPlaylistCover";

type Props = {
  open: boolean;
  title: string;
  description: string;
  tracks: MediaFile[];
  coverFile: MediaFile | null;
  /** Which field gets focus, so clicking the description lands in the description box. */
  focus: "title" | "description";
  onSave: (details: { title: string; description: string }) => void;
  onClose: () => void;
};

const FIELD =
  "w-full rounded-md bg-white/[0.08] px-3 text-sm text-white placeholder:text-white/40 outline-none border border-transparent focus:border-white/20 focus:bg-white/[0.12] caret-[color:var(--music-accent)]";

/** Spotify's "Edit details" card: cover on the left, name and description on the right. */
export function MusicPlaylistEditDetails({
  open,
  title,
  description,
  tracks,
  coverFile,
  focus,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description);
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(title);
    setDesc(description);
    const t = window.setTimeout(() => (focus === "description" ? descRef.current : nameRef.current)?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, title, description, focus]);

  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave({ title: name, description: desc });
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          // Portaled outside the music shell, so it re-enters the palette scope for --music-accent.
          data-music-mode="true"
          className={`fixed inset-0 ${OVERLAY_Z_CLASS.confirm} flex items-center justify-center bg-black/70 px-4`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-label="Edit details"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            className="w-full max-w-[524px] rounded-lg bg-[#282828] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Edit details</h2>
              <button
                type="button"
                onClick={onClose}
                className="rf-music-press rf-music-tooltip-anchor flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close"
                data-tooltip="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-4">
              <MusicPlaylistCover
                files={tracks}
                coverFile={coverFile}
                className="h-[180px] w-[180px] shrink-0 shadow-[0_4px_60px_rgba(0,0,0,0.5)]"
                iconSize={56}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <input
                  ref={nameRef}
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Add a name"
                  aria-label="Name"
                  className={`${FIELD} h-10 font-semibold`}
                />
                <textarea
                  ref={descRef}
                  value={desc}
                  maxLength={PLAYLIST_DESCRIPTION_MAX}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Add an optional description"
                  aria-label="Description"
                  className={`${FIELD} flex-1 resize-none py-2 rf-scrollbar`}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={!canSave}
                className="rounded-full bg-[var(--music-accent)] px-8 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                Save
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

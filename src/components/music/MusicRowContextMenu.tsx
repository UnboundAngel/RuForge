import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ListVideo, FolderOpen, User, Disc3, Play, Music2, Heart } from "lucide-react";
import { primaryArtist } from "./musicArtist";
import { musicTrackIdentityKey } from "./musicShelfDedup";

import type { MediaFile } from "@/types";
import { openInFileManager } from "@/openInFileManager";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { artistKeyFromFile } from "./musicArtist";
import { albumKeyFromFile } from "./musicShelfDedup";

export type MusicMenuContext =
  | { kind: "song"; file: MediaFile }
  | { kind: "artist"; artistKey: string; displayName: string }
  | { kind: "album"; artistKey: string; albumKey: string; displayName: string; artistName?: string };

export type MusicRowContextMenuState = {
  context: MusicMenuContext;
  x: number;
  y: number;
  /** Caller-provided play action: play this song / play all by artist / play album. */
  onPlay?: () => void;
};

type Props = {
  menu: MusicRowContextMenuState | null;
  onClose: () => void;
};

const ROW =
  "flex items-center gap-[9px] w-full px-3 h-9 text-[13px] text-[#c0c0c0] hover:text-white hover:bg-white/[0.07] border-0 outline-none text-left cursor-pointer transition-colors duration-100";

export function MusicRowContextMenu({ menu, onClose }: Props) {
  const enqueueManualQueue = useRuforgeStore((s) => s.enqueueManualQueue);
  const toggleMusicLike = useRuforgeStore((s) => s.toggleMusicLike);
  const musicLikedKeys = useRuforgeStore((s) => s.musicLikedKeys);
  const openMusicArtist = useRuforgeStore((s) => s.openMusicArtist);
  const openMusicAlbum = useRuforgeStore((s) => s.openMusicAlbum);
  const openMusicSong = useRuforgeStore((s) => s.openMusicSong);

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

  const { context } = menu;
  const left = Math.min(menu.x, window.innerWidth - 224);
  const top = Math.min(menu.y, window.innerHeight - 240);

  function act(fn: () => void) {
    return () => { fn(); onClose(); };
  }

  let rows: React.ReactNode;

  if (context.kind === "song") {
    const { file } = context;
    const artistKey = artistKeyFromFile(file);
    const albumKey = albumKeyFromFile(file);
    const hasArtist = !!artistKey;
    const hasAlbum = !!(file.canonicalAlbum ?? file.album)?.trim();
    const liked = musicLikedKeys.includes(musicTrackIdentityKey(file, primaryArtist));

    rows = (
      <>
        {menu.onPlay && (
          <button className={ROW} onClick={act(menu.onPlay)}>
            <Play size={14} strokeWidth={2} />
            Play
          </button>
        )}
        <button
          className={ROW}
          style={liked ? { color: "var(--music-accent)" } : undefined}
          onClick={act(() => toggleMusicLike(file))}
        >
          <Heart size={14} strokeWidth={2} fill={liked ? "currentColor" : "none"} />
          {liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
        </button>
        <button className={ROW} onClick={act(() => enqueueManualQueue(file.path))}>
          <ListVideo size={14} strokeWidth={2} />
          Add to queue
        </button>
        <button className={ROW} onClick={act(() => openMusicSong(file.path))}>
          <Music2 size={14} strokeWidth={2} />
          Go to song
        </button>
        {(hasArtist || hasAlbum) && <div className="h-1" />}
        {hasArtist && (
          <button className={ROW} onClick={act(() => openMusicArtist(artistKey))}>
            <User size={14} strokeWidth={2} />
            Go to artist
          </button>
        )}
        {hasAlbum && (
          <button className={ROW} onClick={act(() => openMusicAlbum(artistKey, albumKey))}>
            <Disc3 size={14} strokeWidth={2} />
            Go to album
          </button>
        )}
        <div className="h-1" />
        <button className={ROW} onClick={act(() => void openInFileManager(file.path))}>
          <FolderOpen size={14} strokeWidth={2} />
          Show in folder
        </button>
      </>
    );
  } else if (context.kind === "artist") {
    rows = (
      <>
        {menu.onPlay && (
          <button className={ROW} onClick={act(menu.onPlay)}>
            <Play size={14} strokeWidth={2} />
            Play all
          </button>
        )}
        <button className={ROW} onClick={act(() => openMusicArtist(context.artistKey))}>
          <User size={14} strokeWidth={2} />
          Go to artist
        </button>
      </>
    );
  } else {
    rows = (
      <>
        {menu.onPlay && (
          <button className={ROW} onClick={act(menu.onPlay)}>
            <Play size={14} strokeWidth={2} />
            Play album
          </button>
        )}
        <button className={ROW} onClick={act(() => openMusicAlbum(context.artistKey, context.albumKey))}>
          <Disc3 size={14} strokeWidth={2} />
          Go to album
        </button>
        {context.artistKey && (
          <button className={ROW} onClick={act(() => openMusicArtist(context.artistKey))}>
            <User size={14} strokeWidth={2} />
            Go to artist
          </button>
        )}
      </>
    );
  }

  const portal = (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.94, y: -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -5 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      style={{ position: "fixed", left, top, zIndex: 9999 }}
      className="w-52 bg-[#0f0f0f] border border-white/[0.11] rounded-[18px] shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {rows}
    </motion.div>
  );

  return createPortal(portal, document.body);
}

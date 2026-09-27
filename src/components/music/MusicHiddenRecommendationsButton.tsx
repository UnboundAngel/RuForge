import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { EyeOff, Music, User } from "lucide-react";
import {
  type HiddenArtist,
  type HiddenSong,
  unhideArtist,
  unhideSong,
  useHiddenRecommendations,
} from "./musicHiddenRecommendations";
import { MusicMenuPanel, placeMusicFloatingMenu, useMusicMenuEscape } from "./musicMenuUi";

const PANEL_W = 320;
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Sits beside Refresh on the Recommended shelf, where hiding happens, and lists every hidden
 * song and artist so each can come back. Only shown once something is hidden.
 */
export function MusicHiddenRecommendationsButton() {
  const songs = useHiddenRecommendations((s) => s.songs);
  const artists = useHiddenRecommendations((s) => s.artists);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const count = songs.length + artists.length;
  if (count === 0 && !open) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rf-music-press rf-music-tooltip-anchor h-8 px-2.5 flex items-center gap-1.5 rounded-full text-sm font-bold text-white/70 hover:text-white hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]"
        aria-label={`Hidden from recommendations: ${count}`}
        aria-expanded={open}
        data-tooltip="Hidden from recommendations"
      >
        <EyeOff size={16} aria-hidden />
        <span className="tabular-nums">{count}</span>
      </button>
      {open && buttonRef.current && (
        <HiddenPanel anchor={buttonRef.current} songs={songs} artists={artists} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function HiddenPanel({
  anchor,
  songs,
  artists,
  onClose,
}: {
  anchor: HTMLElement;
  songs: HiddenSong[];
  artists: HiddenArtist[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const empty = songs.length === 0 && artists.length === 0;

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const height = ref.current?.getBoundingClientRect().height ?? 0;
    setPos(placeMusicFloatingMenu(a.right - PANEL_W, a.bottom + 8, PANEL_W, height));
  }, [anchor, empty]);

  useMusicMenuEscape(true, onClose);
  // The toggle button closes the panel through its own onClick; closing here too would reopen it.
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handle, { capture: true });
    return () => document.removeEventListener("mousedown", handle, { capture: true });
  }, [anchor, onClose]);

  return createPortal(
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: pos ? 1 : 0, y: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, width: PANEL_W, zIndex: 9999 }}
      role="dialog"
      aria-label="Hidden from recommendations"
    >
      <MusicMenuPanel className="max-h-[min(440px,70vh)] gap-2 p-2">
        <div className="px-2 pt-1">
          <div className="text-sm font-bold text-white">Hidden from recommendations</div>
          <div className="mt-0.5 text-xs text-white/50">
            These never show up under your playlists. Nothing was deleted.
          </div>
        </div>
        {empty && <p className="px-2 py-3 text-xs text-white/50">Nothing hidden right now.</p>}
        {artists.length > 0 && (
          <HiddenGroup label="Artists">
            {artists.map((a) => (
              <HiddenRow
                key={`artist:${a.key}`}
                cover={
                  <div className="w-9 h-9 rounded-full bg-white/[0.07] flex items-center justify-center text-white/40">
                    <User size={16} />
                  </div>
                }
                title={a.name}
                subtitle="All songs by this artist"
                onUnhide={() => unhideArtist(a.key)}
              />
            ))}
          </HiddenGroup>
        )}
        {songs.length > 0 && (
          <HiddenGroup label="Songs">
            {songs.map((s) => (
              <HiddenRow
                key={`song:${s.id}`}
                cover={<SongCover song={s} />}
                title={s.title}
                subtitle={s.artist || (s.path ? "Your library" : "YouTube Music")}
                onUnhide={() => unhideSong(s.id)}
              />
            ))}
          </HiddenGroup>
        )}
      </MusicMenuPanel>
    </motion.div>,
    document.body,
  );
}

function HiddenGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:color-mix(in_srgb,var(--music-accent)_70%,white)]">
        {label}
      </div>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </section>
  );
}

function SongCover({ song }: { song: HiddenSong }) {
  const [broken, setBroken] = useState(false);
  const src = song.coverPath ? convertFileSrc(song.coverPath) : song.thumbnail;
  if (!src || broken) {
    return (
      <div className="w-9 h-9 rounded bg-white/[0.07] flex items-center justify-center text-white/40">
        <Music size={16} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="w-9 h-9 rounded object-cover"
    />
  );
}

function HiddenRow({
  cover,
  title,
  subtitle,
  onUnhide,
}: {
  cover: React.ReactNode;
  title: string;
  subtitle: string;
  onUnhide: () => void;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, height: 52 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2, ease: EASE } }}
      className="group/hidden flex items-center gap-3 px-2 overflow-hidden rounded-lg transition-colors hover:bg-white/[0.07]"
    >
      <div className="shrink-0">{cover}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-white">{title}</div>
        <div className="truncate text-xs text-white/50">{subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onUnhide}
        className="rf-music-press shrink-0 h-7 px-3 rounded-full text-xs font-bold text-white/70 bg-white/[0.07] hover:text-white hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)]"
        aria-label={`Unhide ${title}`}
      >
        Unhide
      </button>
    </motion.div>
  );
}

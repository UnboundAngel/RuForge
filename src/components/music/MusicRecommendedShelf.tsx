import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, CloudDownload, Music, Plus } from "lucide-react";
import { bestCoverPath } from "@/mediaKind";
import { cn } from "@/lib/utils";
import type { MediaFile } from "@/types";
import { trackArtistLabel } from "./musicPlaylists";
import type { OutsideTrack } from "./musicOutsideRecommend";
import { type ShelfItem, shelfKey } from "./musicShelfFollowUps";
import { MusicRecommendationMenu, type RecommendationMenuState } from "./MusicRecommendationMenu";
import { MusicPreviewButton, MusicPreviewProgress, useSongPreview } from "./MusicPreviewButton";
import { downloadOutsideTrackIntoPlaylist, useOutsideDownloadPercent } from "./useMusicOutsideRecommendations";

const EASE = [0.22, 1, 0.36, 1] as const;
const CARD_W = 168;
const CARD_GAP = 12;
const SCROLL_BTN =
  "rf-music-press w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.07] text-white/80 hover:text-white hover:bg-[color-mix(in_srgb,var(--music-accent)_22%,#1f1f1f)] disabled:opacity-30 disabled:pointer-events-none";

export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-4 min-w-0">
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/60">{subtitle}</p>
    </div>
  );
}

type CardMenuHandler = (e: React.MouseEvent) => void;

/** Recommendations as a horizontal row of cover cards, paged with the arrows or a trackpad swipe. */
export function CardShelf({
  title,
  subtitle,
  items,
  grownKeys,
  onAdd,
  onOutsideAdd,
  onHide,
  actions,
  listKey,
  outsideLoading = false,
  playlistId,
}: {
  title: string;
  subtitle: string;
  /** Library and YouTube Music songs in display order. */
  items: ShelfItem[];
  /** Cards an add or a hide brought in; they open a slot instead of just fading in. */
  grownKeys?: ReadonlySet<string>;
  onAdd: (file: MediaFile) => void;
  onOutsideAdd?: (track: OutsideTrack) => void;
  /** Enables the right-click menu. */
  onHide?: (item: ShelfItem, scope: "song" | "artist") => void;
  outsideLoading?: boolean;
  playlistId?: string;
  actions?: React.ReactNode;
  /** Changing it re-deals the cards (Refresh) while the header, and its buttons, stay mounted. */
  listKey?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [menu, setMenu] = useState<RecommendationMenuState | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () =>
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    // Cards collapse over 240ms when added; re-check once they settle.
    const t = window.setTimeout(sync, 300);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [items, outsideLoading]);

  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(CARD_W + CARD_GAP, Math.floor(el.clientWidth / (CARD_W + CARD_GAP)) * (CARD_W + CARD_GAP));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const menuFor = (item: ShelfItem): CardMenuHandler | undefined =>
    onHide
      ? (e) => {
          e.preventDefault();
          setMenu({ item, x: e.clientX, y: e.clientY });
        }
      : undefined;
  const menuKey = menu ? shelfKey(menu.item) : null;

  // Fade whichever edge still has cards behind it.
  const mask = `linear-gradient(to right, ${edges.left ? "transparent, black 48px" : "black"}, ${edges.right ? "black calc(100% - 48px), transparent" : "black"})`;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 pr-4">
        <SectionTitle title={title} subtitle={subtitle} />
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {(edges.left || edges.right) && (
            <>
              <button type="button" onClick={() => page(-1)} disabled={!edges.left} className={SCROLL_BTN} aria-label="Scroll left">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => page(1)} disabled={!edges.right} className={SCROLL_BTN} aria-label="Scroll right">
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      <div
        key={listKey}
        ref={scrollRef}
        className="mt-4 flex overflow-x-auto scroll-smooth px-1 pb-2"
        style={{ scrollbarWidth: "none", maskImage: mask, WebkitMaskImage: mask }}
      >
        <AnimatePresence initial={true}>
          {items.map((item, i) => {
            const key = shelfKey(item);
            const grow = grownKeys?.has(key) ?? false;
            const onContextMenu = menuFor(item);
            const active = menuKey === key;
            if (item.kind === "local") {
              const file = item.file;
              return (
                <FinderCard
                  key={key}
                  index={i}
                  grow={grow}
                  file={file}
                  active={active}
                  onContextMenu={onContextMenu}
                  onAdd={() => onAdd(file)}
                />
              );
            }
            if (!playlistId) return null;
            const track = item.track;
            return (
              <OutsideCard
                key={key}
                index={i}
                grow={grow}
                track={track}
                playlistId={playlistId}
                active={active}
                onContextMenu={onContextMenu}
                onAdded={() => onOutsideAdd?.(track)}
              />
            );
          })}
          {outsideLoading &&
            !items.some((i) => i.kind === "outside") &&
            [0, 1, 2].map((i) => <SkeletonCard key={`skeleton-${i}`} index={items.length + i} />)}
        </AnimatePresence>
      </div>
      {onHide && (
        <MusicRecommendationMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onHide={onHide}
          onAddOutside={(item) => {
            if (item.kind !== "outside" || !playlistId) return;
            downloadOutsideTrackIntoPlaylist(item.track, playlistId);
            onOutsideAdd?.(item.track);
          }}
        />
      )}
    </div>
  );
}

/**
 * A card's exit and its replacement's entrance share one timing, so the slot keeps its width
 * in a single slide instead of closing and then reopening.
 */
const SWAP_TRANSITION = { duration: 0.32, ease: EASE, delay: 0.25 };

/** Where a card starts: grown cards open their slot so the neighbors slide aside. */
function cardInitial(grow: boolean) {
  return grow ? { opacity: 0, scale: 0.85, width: 0 } : { opacity: 0, y: 12, width: CARD_W + CARD_GAP };
}

function cardAnimate(grow: boolean, index: number) {
  return {
    opacity: 1,
    y: 0,
    scale: 1,
    width: CARD_W + CARD_GAP,
    transition: grow ? SWAP_TRANSITION : { duration: 0.3, ease: EASE, delay: Math.min(index, 8) * 0.04 },
  };
}

// Shrink the slot so the cards to the right slide over and close the gap.
const CARD_EXIT = { opacity: 0, scale: 0.85, width: 0, transition: SWAP_TRANSITION };

function cardSurface(active: boolean) {
  return cn(
    "group/card w-[168px] p-2 rounded-lg transition-colors duration-200 hover:bg-white/[0.07]",
    active && "bg-white/[0.07]",
  );
}

function FinderCard({
  file,
  index,
  grow,
  active,
  onContextMenu,
  onAdd,
}: {
  file: MediaFile;
  index: number;
  grow: boolean;
  active: boolean;
  onContextMenu?: CardMenuHandler;
  onAdd: () => void;
}) {
  const cover = bestCoverPath(file);
  const artist = trackArtistLabel(file);
  const [added, setAdded] = useState(false);
  return (
    <motion.div
      initial={cardInitial(grow)}
      animate={cardAnimate(grow, index)}
      exit={CARD_EXIT}
      className="shrink-0 overflow-hidden"
      style={{ paddingRight: CARD_GAP }}
    >
      <div className={cardSurface(active)} onContextMenu={onContextMenu}>
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-white/[0.07] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          {cover ? (
            <img src={convertFileSrc(cover)} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30">
              <Music size={40} />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (added) return;
              setAdded(true);
              onAdd();
            }}
            className={cn(
              "rf-music-press rf-music-tooltip-anchor absolute bottom-2 right-2 w-10 h-10 flex items-center justify-center rounded-full bg-[var(--music-accent)] text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
              "transition-[opacity,translate,scale] duration-200 hover:scale-105",
              added
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0",
            )}
            aria-label={`Add ${file.name} to this playlist`}
            data-tooltip={added ? "Added" : "Add to playlist"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={added ? "added" : "add"}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
                className="flex"
              >
                {added ? <Check size={20} strokeWidth={3} /> : <Plus size={22} strokeWidth={2.75} />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
        <div className="mt-2 min-w-0">
          <div className="truncate text-sm font-bold text-white">{file.name}</div>
          <div className="truncate text-xs text-white/60 transition-colors group-hover/card:text-white/80">
            {artist || file.album?.trim() || "Unknown artist"}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

/**
 * A YouTube Music song the user doesn't own yet. Add downloads it; the card shows the progress,
 * then leaves on its own once the file lands in the library (the Music shell adds it to the playlist).
 */
function OutsideCard({
  track,
  index,
  grow,
  playlistId,
  active,
  onContextMenu,
  onAdded,
}: {
  track: OutsideTrack;
  index: number;
  grow: boolean;
  playlistId: string;
  active: boolean;
  onContextMenu?: CardMenuHandler;
  onAdded: () => void;
}) {
  const { queued, percent, failed } = useOutsideDownloadPercent(track.url);
  const busy = queued && !failed;
  const preview = useSongPreview(track.videoId);
  const thumb = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
  return (
    <motion.div
      initial={cardInitial(grow)}
      animate={cardAnimate(grow, index)}
      exit={CARD_EXIT}
      className="shrink-0 overflow-hidden"
      style={{ paddingRight: CARD_GAP }}
    >
      <div className={cardSurface(active)} onContextMenu={onContextMenu}>
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-white/[0.07] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <img
            src={thumb}
            alt=""
            draggable={false}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
          <span
            className="rf-music-tooltip-anchor absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/70 text-white/80"
            data-tooltip="Not downloaded"
            aria-label="Not downloaded"
          >
            <CloudDownload size={13} strokeWidth={2.5} aria-hidden />
          </span>
          {preview.status && <MusicPreviewProgress progress={preview.progress} />}
          <MusicPreviewButton track={track} status={preview.status} />
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              downloadOutsideTrackIntoPlaylist(track, playlistId);
              onAdded();
            }}
            className={cn(
              "rf-music-press rf-music-tooltip-anchor absolute bottom-2 right-2 w-10 h-10 flex items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
              "transition-[opacity,translate,scale,background-color] duration-200",
              busy ? "bg-black/80" : "bg-[var(--music-accent)] hover:scale-105",
              busy
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0",
            )}
            aria-label={busy ? `Downloading ${track.title}` : `Download ${track.title} and add it to this playlist`}
            data-tooltip={busy ? `Downloading ${Math.round(percent)}%` : failed ? "Download failed. Try again" : "Download and add"}
          >
            <AnimatePresence mode="wait" initial={false}>
              {busy ? (
                <motion.svg
                  key="ring"
                  viewBox="0 0 40 40"
                  className="w-10 h-10 -rotate-90"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  aria-hidden
                >
                  <circle cx="20" cy="20" r={RING_R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
                  <motion.circle
                    cx="20"
                    cy="20"
                    r={RING_R}
                    fill="none"
                    stroke="var(--music-accent)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    initial={false}
                    animate={{ strokeDashoffset: RING_C * (1 - Math.max(0.04, percent / 100)) }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                </motion.svg>
              ) : (
                <motion.span
                  key="add"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  className="flex"
                >
                  <Plus size={22} strokeWidth={2.75} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
        <div className="mt-2 min-w-0">
          <div
            className={cn(
              "truncate text-sm font-bold transition-colors",
              preview.status ? "text-[var(--music-accent)]" : "text-white",
            )}
          >
            {track.title}
          </div>
          <div className="truncate text-xs text-white/60 transition-colors group-hover/card:text-white/80">
            {track.artist || "YouTube Music"}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: Math.min(index, 8) * 0.04 } }}
      exit={{ opacity: 0, width: 0, transition: { duration: 0.2 } }}
      className="shrink-0 overflow-hidden"
      style={{ width: CARD_W + CARD_GAP, paddingRight: CARD_GAP }}
      aria-hidden
    >
      <div className="w-[168px] p-2">
        <div className="aspect-square w-full rounded-md bg-white/[0.07] animate-pulse" />
        <div className="mt-3 h-3 w-4/5 rounded bg-white/[0.07] animate-pulse" />
        <div className="mt-2 h-2.5 w-1/2 rounded bg-white/[0.05] animate-pulse" />
      </div>
    </motion.div>
  );
}

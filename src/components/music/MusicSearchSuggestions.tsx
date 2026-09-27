import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Icon } from "@iconify/react";
import { Disc3, History, ListMusic, Music2, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaFile } from "@/types";
import type { LibraryHit } from "./musicLibrarySearch";

export type MusicSearchSuggestion =
  | { kind: "youtube"; key: string; query: string }
  | { kind: "search"; key: string; query: string; thumb: string | null; at: number }
  | { kind: "play"; key: string; file: MediaFile; title: string; artist: string; thumb: string | null; at: number }
  | LibraryHit;

type Props = {
  items: MusicSearchSuggestion[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (item: MusicSearchSuggestion) => void;
  onRemoveSearch: (query: string) => void;
};

const ICON = "shrink-0 text-white/85";

function describe(item: MusicSearchSuggestion): { icon: ReactNode; title: string; meta: string | null } {
  switch (item.kind) {
    case "youtube":
      return {
        icon: <Icon icon="material-symbols:youtube-music" width={20} height={20} className="shrink-0 text-[color:var(--music-accent)]" aria-hidden />,
        title: `Search YouTube Music for "${item.query}"`,
        meta: null,
      };
    case "search":
      return { icon: <History size={20} className={ICON} aria-hidden />, title: item.query, meta: null };
    case "play":
      return { icon: <History size={20} className={ICON} aria-hidden />, title: item.title, meta: item.artist || null };
    case "song":
      return { icon: <Music2 size={20} className={ICON} aria-hidden />, title: item.title, meta: item.artist ? `Song · ${item.artist}` : "Song" };
    case "playlist":
      return {
        icon: <ListMusic size={20} className={ICON} aria-hidden />,
        title: item.title,
        meta: `Playlist · ${item.count} ${item.count === 1 ? "song" : "songs"}`,
      };
    case "album":
      return { icon: <Disc3 size={20} className={ICON} aria-hidden />, title: item.title, meta: `Album · ${item.artist}` };
    case "artist":
      return { icon: <User size={20} className={ICON} aria-hidden />, title: item.title, meta: "Artist" };
  }
}

/** The card that wraps the search pill on focus. Its 4px margin only fits under the window edge because the pill is 36px in a 48px titlebar. */
export function MusicSearchSuggestions({ items, activeIndex, onHover, onPick, onRemoveSearch }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: "top center" }}
      className="absolute -inset-x-1 -top-1 rounded-[22px] bg-[#232323] pt-[46px] pb-2 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
      onMouseDown={(e) => e.preventDefault()}
    >
      <ul role="listbox" aria-label="Search suggestions" className="rf-scrollbar max-h-[min(540px,68vh)] overflow-y-auto px-1.5">
        {items.map((item, i) => {
          const { icon, title, meta } = describe(item);
          const thumb = "thumb" in item ? item.thumb : null;
          return (
            <li key={item.key} role="option" aria-selected={i === activeIndex}>
              <div
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(item)}
                className={cn(
                  "group/row flex h-12 cursor-pointer items-center gap-4 rounded-2xl px-2 transition-colors duration-100",
                  i === activeIndex && "bg-white/[0.08]",
                )}
              >
                {icon}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
                  {title}
                  {meta ? <span className="font-medium text-white/50">{` · ${meta}`}</span> : null}
                </span>
                {item.kind === "search" ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSearch(item.query);
                    }}
                    className="rf-music-press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 opacity-0 transition-opacity hover:text-white group-hover/row:opacity-100"
                    aria-label={`Remove ${item.query} from history`}
                  >
                    <X size={15} />
                  </button>
                ) : null}
                {thumb ? (
                  <img
                    src={convertFileSrc(thumb)}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                    className={cn(
                      "h-8 w-8 shrink-0 object-cover",
                      item.kind === "artist" ? "rounded-full" : "rounded-md",
                    )}
                  />
                ) : item.kind === "youtube" ? null : (
                  <span className="w-8 shrink-0" aria-hidden />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

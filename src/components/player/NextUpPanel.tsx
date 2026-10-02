import { memo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion, type MotionValue } from "motion/react";
import { Music, Video, X } from "lucide-react";
import { useScrollEdgeState } from "@/hooks/useScrollEdgeState";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import { formatDuration } from "@/components/downloader/downloaderFormat";
import { cn } from "@/lib/utils";
import { isAudioOnlyPath } from "../../mediaKind";
import type { MediaFile } from "../../types";

export const NEXT_UP_PANEL_WIDTH = 340;

type Props = {
  open: boolean;
  x: MotionValue<number>;
  items: MediaFile[];
  currentPath: string;
  onSelect: (item: MediaFile) => void;
  onClose: () => void;
};

const displayName = (item: MediaFile) => item.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "");

/** Same bezel, concave seam and header as the comments drawer so the two side panels read as one family. */
export function NextUpPanel({ open, x, items, currentPath, onSelect, onClose }: Props) {
  const { scrollRef, edges, onScroll } = useScrollEdgeState([items.length]);

  return (
    <motion.div
      style={{ width: NEXT_UP_PANEL_WIDTH, x }}
      className={cn(
        "absolute bottom-0 right-0 top-0 z-[85] flex flex-col bg-[#271C18]",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <svg className="pointer-events-none absolute right-full top-0 h-5 w-5" viewBox="0 0 20 20" aria-hidden>
        <path d="M20 0H0C11.046 0 20 8.954 20 20V0Z" fill="#271C18" />
      </svg>

      <div
        className="rf-comments-header flex shrink-0 items-center justify-between px-6 pb-3 pt-5"
        data-scrolled={edges.top ? "true" : undefined}
      >
        <div className="flex items-baseline gap-3">
          <h2 className="text-[20px] font-bold tracking-tight text-white">Next up</h2>
          {items.length > 0 ? (
            <span className="text-[14px] font-medium tabular-nums text-white/50">{items.length}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="cursor-pointer rounded-full p-2.5 text-white/90 transition-colors hover:bg-white/10"
          onClick={onClose}
          aria-label="Close next up"
        >
          <X size={22} strokeWidth={2} />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="rf-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-6 pt-1"
      >
        {items.length === 0 ? (
          <p className="px-3 py-8 text-[13px] font-medium text-white/45">nothing queued after this one.</p>
        ) : (
          items.map((item) => (
            <NextUpRow key={item.path} item={item} active={item.path === currentPath} onSelect={onSelect} />
          ))
        )}
      </div>
    </motion.div>
  );
}

const NextUpRow = memo(function NextUpRow({
  item,
  active,
  onSelect,
}: {
  item: MediaFile;
  active: boolean;
  onSelect: (item: MediaFile) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const thumb = item.thumbnailPath || item.ruforgePosterPath;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors duration-150",
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
      )}
    >
      <span className="relative aspect-video w-[120px] shrink-0 overflow-hidden rounded-lg bg-[#1D1613]">
        {thumb ? (
          <img
            src={convertFileSrc(thumb)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : isAudioOnlyPath(item.path) ? (
          <Music size={18} className="absolute inset-0 m-auto text-stone-600" aria-hidden />
        ) : (
          <Video size={18} className="absolute inset-0 m-auto text-stone-600" aria-hidden />
        )}
        {item.duration > 0 ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-px text-[10px] font-semibold tabular-nums leading-tight text-white">
            {formatDuration(item.duration)}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <HoverMarqueeText
          text={displayName(item)}
          active={hovered}
          className={cn("text-[13px] font-semibold", active ? "text-[color:var(--accent)]" : "text-stone-100")}
        />
        {active ? (
          <span className="mt-0.5 block text-[11px] font-medium text-[color:var(--accent)]/80">Now playing</span>
        ) : item.youtube?.channel ? (
          <span className="mt-0.5 block truncate text-[11px] text-stone-500">{item.youtube.channel}</span>
        ) : null}
      </span>
    </button>
  );
});

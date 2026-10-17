import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpDown, Check, X } from "lucide-react";
import { useScrollEdgeState } from "@/hooks/useScrollEdgeState";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
} from "@/components/music/musicMenuUi";
import { motionDuration, pageTransition } from "@/lib/overlayMotion";
import type { MediaFile } from "../../../types";
import { PlayerSidePanelShell } from "../sidePanel/PlayerSidePanelShell";
import { NextUpCard } from "./NextUpCard";
import { NextUpNowPlaying, SECTION_LABEL } from "./NextUpNowPlaying";
import {
  NEXT_UP_SORT_OPTIONS,
  buildNextUpOrder,
  hasChannelData,
  type NextUpSort,
} from "./nextUpOrder";
import { useNextUpSort } from "./useNextUpSort";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnimatedXChange: (x: number) => void;
  /** Folder files already in playback order (sorted by the chosen sort). */
  items: MediaFile[];
  currentPath: string;
  /** Loop-all wraps playback back to the start of the list. */
  wraps: boolean;
  onSelect: (item: MediaFile) => void;
};

export function NextUpPanel({ open, onOpenChange, onAnimatedXChange, items, currentPath, wraps, onSelect }: Props) {
  const [sort, setSort] = useNextUpSort();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollRef, edges, onScroll } = useScrollEdgeState([items.length, sort]);

  const order = useMemo(() => buildNextUpOrder(items, currentPath, wraps), [items, currentPath, wraps]);
  const channelSort = useMemo(() => hasChannelData(items), [items]);
  const queued = order.upNext.length + order.earlier.length;
  const options = NEXT_UP_SORT_OPTIONS.filter((o) => o.id !== "channel" || channelSort || sort === "channel");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [sort, scrollRef]);

  const pick = (id: NextUpSort) => {
    setSort(id);
    setMenuAt(null);
  };

  return (
    <PlayerSidePanelShell
      isOpen={open}
      onOpenChange={onOpenChange}
      enableEdgeHold={false}
      onAnimatedXChange={onAnimatedXChange}
    >
      <div className="relative flex h-full flex-col overflow-hidden">
        <div
          className="rf-comments-header flex shrink-0 items-center justify-between px-6 pb-3 pt-5"
          data-scrolled={edges.top ? "true" : undefined}
        >
          <div className="flex items-baseline gap-3">
            <h2 className="text-[20px] font-bold tracking-tight text-white">Next up</h2>
            {queued > 0 ? (
              <span className="text-[14px] font-medium tabular-nums text-white/50">{queued}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-white/90">
            <button
              ref={sortBtnRef}
              type="button"
              onClick={() => {
                if (sortBtnRef.current) setMenuAt(menuAnchorPoint(sortBtnRef.current));
              }}
              className={`flex cursor-pointer items-center justify-center rounded-full p-2.5 text-white/90 transition-colors hover:bg-white/10 ${menuAt ? "bg-white/10" : ""}`}
              aria-label="Sort next up"
              aria-haspopup="menu"
              aria-expanded={menuAt !== null}
            >
              <ArrowUpDown size={20} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-full p-2.5 transition-colors hover:bg-white/10"
              onClick={() => onOpenChange(false)}
              aria-label="Close panel"
            >
              <X size={22} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="rf-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-8 pt-2"
        >
          <motion.div
            key={sort}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionDuration(reduceMotion, pageTransition)}
          >
            {order.current ? <NextUpNowPlaying item={order.current} /> : null}

            {queued === 0 ? (
              <p className="px-6 py-8 text-[13px] font-medium text-white/45">that&apos;s the last one in this folder.</p>
            ) : (
              <>
                {order.upNext.length > 0 ? (
                  <NextUpGroup label="Up next" items={order.upNext} leadFirst onSelect={onSelect} />
                ) : null}
                {order.earlier.length > 0 ? (
                  <NextUpGroup label="Earlier in this folder" items={order.earlier} onSelect={onSelect} />
                ) : null}
              </>
            )}
          </motion.div>
        </div>
      </div>

      <MusicFloatingMenu
        open={menuAt !== null}
        x={menuAt?.x ?? 0}
        y={menuAt?.y ?? 0}
        theme="library"
        onClose={() => setMenuAt(null)}
        ariaLabel="Sort next up"
      >
        <MusicMenuSection label="Sort by" tone={MUSIC_MENU_TONES.queue}>
          {options.map((o) => (
            <MusicMenuRow
              key={o.id}
              tone={MUSIC_MENU_TONES.queue}
              label={o.label}
              active={sort === o.id}
              icon={sort === o.id ? <Check size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.5} /> : <span className="block w-[13px]" />}
              onClick={() => pick(o.id)}
            />
          ))}
        </MusicMenuSection>
      </MusicFloatingMenu>
    </PlayerSidePanelShell>
  );
}

function NextUpGroup({
  label,
  items,
  leadFirst = false,
  onSelect,
}: {
  label: string;
  items: MediaFile[];
  leadFirst?: boolean;
  onSelect: (item: MediaFile) => void;
}) {
  return (
    <section className="px-2 pt-4" aria-label={label}>
      <p className={`${SECTION_LABEL} px-3 pb-1.5`}>{label}</p>
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <NextUpCard key={item.path} item={item} lead={leadFirst && i === 0} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

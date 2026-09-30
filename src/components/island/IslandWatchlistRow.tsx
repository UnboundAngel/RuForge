import { Icon } from "@iconify/react";
import { Download } from "lucide-react";
import type { MouseEvent } from "react";

import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";

export type IslandWatchlistFace = { src: string | null; initial: string };

export type IslandWatchlistRowData = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  /** Premiere or stream: nothing to download yet, so Queue is hidden. */
  upcoming: boolean;
  live: boolean;
};

export function IslandWatchlistFaces({ faces }: { faces: readonly IslandWatchlistFace[] }) {
  return (
    <span className="flex shrink-0 items-center pl-2">
      {faces.map((face, i) => (
        <span
          key={i}
          className="-ml-2 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[10px] font-bold text-stone-300 ring-2 ring-[color:var(--rf-island-shell-media)]"
        >
          {face.src ? (
            <img src={face.src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            face.initial
          )}
        </span>
      ))}
    </span>
  );
}

const actionClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition-[color,background-color,transform] duration-150 hover:bg-white/[0.08] hover:text-[color:var(--accent)] active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100";

export function IslandWatchlistRow({
  row,
  onQueue,
  onOpen,
}: {
  row: IslandWatchlistRowData;
  onQueue: (videoId: string) => void;
  onOpen: (videoId: string) => void;
}) {
  const stop = (fn: (id: string) => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn(row.videoId);
  };

  return (
    <li className="group flex min-w-0 items-center gap-2.5 rounded-xl p-1 transition-colors duration-150 hover:bg-white/[0.05] motion-reduce:transition-none">
      <img
        src={row.thumbnail}
        alt=""
        className="h-9 w-16 shrink-0 rounded-lg object-cover"
        referrerPolicy="no-referrer"
      />
      <div className="min-w-0 flex-1">
        <HoverMarqueeText text={row.title} slow className="text-[12px] font-semibold leading-tight text-stone-100" />
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] leading-tight text-stone-500">
          <span className="truncate">{row.channel}</span>
          {row.upcoming ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent),transparent_85%)] px-1.5 text-[9px] font-bold text-[color:var(--accent)]">
              {row.live ? "Live" : "Premiere"}
            </span>
          ) : null}
        </p>
      </div>
      {row.upcoming ? null : (
        <button type="button" data-tooltip="Queue download" onClick={stop(onQueue)} className={actionClass}>
          <Download size={14} strokeWidth={2.25} />
        </button>
      )}
      <button type="button" data-tooltip="Open in Explorer" onClick={stop(onOpen)} className={actionClass}>
        <Icon icon="tabler:brand-youtube" width={15} height={15} />
      </button>
    </li>
  );
}

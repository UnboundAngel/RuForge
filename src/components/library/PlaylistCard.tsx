import type { MouseEvent, ReactNode, Ref } from "react";
import { ListVideo } from "lucide-react";
import { localImageSrc } from "@/lib/localImageSrc";
import { distinctChannels } from "@/components/playlist-detail/PlaylistAvatarStack";
import type { MediaFile } from "@/types";
import { ChannelAvatar } from "./VideoByline";
import { PlaylistEmptyThumb } from "@/components/PlaylistEmptyThumb";

/** Marks carry their own ring (a box-shadow follows their shape) in the page colour, so round stays round. */
export const CARD_MARK = "h-11 w-11 shrink-0 ring-4 ring-[color:var(--rf-well)]";

type Action = { label: string; ariaLabel: string; icon: ReactNode; onClick: () => void };

type Props = {
  rootRef?: Ref<HTMLDivElement>;
  /** Value of `data-playlist-card`, which the download fly-in and drop targets look up. */
  dataKey?: string;
  cover: string | null | undefined;
  /** Replaces the empty-playlist plate when there is no cover. */
  emptyCover?: ReactNode;
  count: string;
  /** The identity mark that overlaps the cover's bottom-left; none when there is nothing real to show. */
  mark?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  /** Suggestions carry one; your own playlists open on click instead. */
  action?: Action;
  isNew?: boolean;
  /** The onboarding demo playlist: gets a Demo chip instead of New. */
  demo?: boolean;
  /** `data-onboarding-target` for the tour's spotlight. */
  targetId?: string;
  dropArmed?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
};

/**
 * The one Library card for a playlist, yours or suggested. The count sits bottom-right like a duration; a mark overlaps the cover's corner.
 * Kinds differ only in the mark, the meta line and whether there is an action.
 */
export function PlaylistCard({
  rootRef,
  dataKey,
  cover,
  emptyCover,
  count,
  mark,
  title,
  meta,
  action,
  isNew,
  demo,
  targetId,
  dropArmed,
  onClick,
  onContextMenu,
}: Props) {
  return (
    <div
      ref={rootRef}
      data-playlist-card={dataKey}
      data-onboarding-target={targetId}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group/card relative flex min-w-0 flex-col ${onClick ? "cursor-pointer" : ""}`}
    >
      <div
        data-squish-cover
        className={`rf-art-clip relative aspect-video bg-[color:var(--rf-field)] transition-transform duration-150 ease-out [--rf-art-r:14px] ${
          dropArmed ? "scale-[1.03]" : ""
        }`}
      >
        {cover ? (
          <img
            src={/^https?:/.test(cover) ? cover : localImageSrc(cover)}
            referrerPolicy="no-referrer"
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover transition-[filter] duration-200 group-hover/card:brightness-110"
          />
        ) : (
          (emptyCover ?? <PlaylistEmptyThumb className="absolute inset-0" />)
        )}
        <span className="absolute bottom-2 right-2 inline-flex h-6 items-center gap-1 rounded-full bg-black/70 px-2 text-[11px] font-semibold tabular-nums text-white">
          <ListVideo size={12} strokeWidth={2.25} aria-hidden />
          {count}
        </span>
        {demo ? (
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            Demo
          </span>
        ) : isNew ? (
          <span className="absolute left-2 top-2 rounded-md bg-[color:var(--accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--rf-on-accent)]">
            New
          </span>
        ) : null}
        {dropArmed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white">Add to playlist</span>
          </div>
        ) : null}
      </div>

      <div className="relative -mt-5 h-11 px-2.5">{mark}</div>
      <div className="relative flex items-start gap-3 px-2.5">
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="flex min-w-0 items-center gap-1.5 text-[15px] font-bold leading-tight text-stone-50">{title}</h3>
          <p className="mt-1 min-h-4 truncate text-[11px] font-medium text-stone-400">{meta}</p>
        </div>
        {action ? (
          <button
            type="button"
            aria-label={action.ariaLabel}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[color:var(--accent)] pl-2.5 pr-3.5 text-[11px] font-bold text-[color:var(--rf-on-accent)] transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            {action.icon}
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The playlist's real creators as overlapping circles; null when its videos name none. */
export function CreatorsMark({ items }: { items: readonly MediaFile[] }) {
  const channels = distinctChannels(items);
  if (channels.length === 0) return null;
  return (
    <div className="flex items-center" aria-hidden>
      {channels.map((c, i) => (
        <div key={c.channelId} className={i > 0 ? "-ml-3.5" : ""} style={{ zIndex: channels.length - i }}>
          <ChannelAvatar channelId={c.channelId} channel={c.channel} className={`${CARD_MARK} relative rounded-full`} />
        </div>
      ))}
    </div>
  );
}

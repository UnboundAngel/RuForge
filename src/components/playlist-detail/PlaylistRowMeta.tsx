import { Check, Flag } from "lucide-react";
import type { MediaFile } from "@/types";
import { ChannelAvatar } from "@/components/library/VideoByline";
import { openCreatorPage } from "@/components/library/creatorPageStore";
import { useRuforgeStore } from "@/store/ruforgeStore";

type Props = {
  file: MediaFile;
  watched: boolean;
  isStart: boolean;
};

/** Second line of a row: the channel (opens its creator page) and the row's state. */
export function PlaylistRowMeta({ file, watched, isStart }: Props) {
  const channel = file.youtube?.channel;
  const channelId = file.youtube?.channelId;

  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] font-medium text-stone-500">
      {channel && channelId ? (
        <ChannelAvatar channelId={channelId} channel={channel} className="h-5 w-5 text-[10px]" />
      ) : null}
      {channel && channelId ? (
        <button
          type="button"
          aria-label={`Open ${channel}'s page`}
          onClick={(e) => {
            e.stopPropagation();
            // The creator page renders inside the library, so the playlist view has to close first.
            useRuforgeStore.getState().setSelectedPlaylist(null);
            openCreatorPage(channelId, channel);
          }}
          className="min-w-0 truncate font-semibold text-stone-300 transition-colors hover:text-[color:var(--accent)] hover:underline hover:underline-offset-2"
        >
          {channel}
        </button>
      ) : (
        <span className="min-w-0 truncate font-semibold text-stone-400">{channel ?? "Local file"}</span>
      )}
      {watched ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-stone-300">
          <Check size={12} strokeWidth={3} />
          Watched
        </span>
      ) : null}
      {isStart ? (
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-[color:var(--accent)]" data-tooltip="Start over begins here">
          <Flag size={12} strokeWidth={2.5} />
          Starts here
        </span>
      ) : null}
    </div>
  );
}

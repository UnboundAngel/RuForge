import { ChannelAvatar } from "@/components/library/VideoByline";
import { formatAge } from "@/components/library/youtubeFeed";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import type { WatchedChannel } from "@/watchlist/types";
import { MiniToggle } from "./MiniToggle";

type Props = {
  channel: WatchedChannel;
  onAutoDownload: (channelId: string, enabled: boolean) => void;
  onUnfollow: (channelId: string) => void;
};

function statusLine(ch: WatchedChannel): string {
  if (ch.lastError) return ch.lastError;
  if (ch.lastCheckedAt == null) return "Waiting for the first check";
  return `Checked ${formatAge(ch.lastCheckedAt)}`;
}

function handleLabel(handle: string | null): string | null {
  if (!handle) return null;
  return handle.startsWith("@") ? handle : `@${handle}`;
}

export function ChannelRow({ channel, onAutoDownload, onUnfollow }: Props) {
  const handle = handleLabel(channel.handle);
  const status = statusLine(channel);

  return (
    <li className="group flex items-center gap-3 rounded-xl p-2 transition-colors duration-150 hover:bg-[color:var(--rf-popover-raised)]">
      <ChannelAvatar channelId={channel.channelId} channel={channel.title} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <HoverMarqueeText text={channel.title} slow className="text-[13px] font-semibold text-stone-100" />
          </div>
          <button
            type="button"
            onClick={() => onUnfollow(channel.channelId)}
            className="shrink-0 text-[11px] font-semibold text-stone-500 opacity-0 transition-[color,opacity] duration-150 hover:text-[color:var(--accent)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            Unfollow
          </button>
        </div>
        <div className="flex min-w-0 items-center text-[11px]">
          {handle ? <span className="max-w-[45%] shrink-0 truncate text-stone-500">{handle}</span> : null}
          {handle ? <span className="mx-1.5 shrink-0 text-stone-600">·</span> : null}
          <HoverMarqueeText
            text={status}
            slow
            className={channel.lastError ? "text-amber-300/90" : "text-stone-500"}
          />
        </div>
      </div>
      <MiniToggle
        active={channel.autoDownload}
        label={channel.autoDownload ? "Auto-download on" : "Auto-download new uploads"}
        onChange={(next) => onAutoDownload(channel.channelId, next)}
      />
    </li>
  );
}

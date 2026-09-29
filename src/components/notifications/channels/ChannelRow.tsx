import { Icon } from "@iconify/react";
import { ChannelAvatar } from "@/components/library/VideoByline";
import { formatAge } from "@/components/library/youtubeFeed";
import type { WatchedChannel } from "@/watchlist/types";
import { panelRowDetailClass, panelRowTitleClass } from "../panelStyles";
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
    <li className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-white/[0.04]">
      <ChannelAvatar channelId={channel.channelId} channel={channel.title} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className={`truncate ${panelRowTitleClass}`}>{channel.title}</p>
        <p className={`mt-0.5 flex min-w-0 ${panelRowDetailClass}`}>
          {handle ? <span className="max-w-[45%] shrink-0 truncate">{handle}</span> : null}
          {handle ? <span className="mx-1.5 shrink-0">·</span> : null}
          <span className={`truncate ${channel.lastError ? "text-amber-300/90" : ""}`}>{status}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onUnfollow(channel.channelId)}
        aria-label={`Unfollow ${channel.title}`}
        data-tooltip="Unfollow"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-500 opacity-0 transition-[color,opacity] duration-150 hover:text-stone-100 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Icon icon="tabler:user-minus" width={18} height={18} aria-hidden />
      </button>
      <MiniToggle
        active={channel.autoDownload}
        label={channel.autoDownload ? "Auto-download on" : "Auto-download new uploads"}
        onChange={(next) => onAutoDownload(channel.channelId, next)}
      />
    </li>
  );
}

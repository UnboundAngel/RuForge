import { useMemo } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CircleUserRound, Compass, Download, Link, MoreVertical, UserCheck, UserPlus } from "lucide-react";
import { MorphMenu, type MorphMenuItem } from "@/components/ui/Morph";
import { useChannelFollow } from "@/components/watchlist/useChannelFollow";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { openUrlInExplorer } from "@/watchlist/watchlistActions";
import { downloadFeedVideo } from "./downloadFeedVideo";
import { GalleryMenuTitle } from "./LibraryVideoCard";
import { openCreatorPage } from "./creatorPageStore";
import type { FeedVideo } from "./youtubeFeed";

export const feedMenuKey = (video: FeedVideo) => `feed:${video.videoId}`;

async function copyLink(url: string): Promise<void> {
  const notify = useRuforgeStore.getState().notify;
  try {
    await writeText(url);
  } catch {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      notify("Failed to write to clipboard.", "error");
      return;
    }
  }
  notify("Link copied");
}

function useFeedMenuItems(video: FeedVideo, canDownload: boolean): MorphMenuItem[] {
  const follow = useChannelFollow(video.channelId, video.channel);
  return useMemo(() => {
    const rows: MorphMenuItem[] = [];
    if (canDownload) {
      rows.push({
        id: "download",
        label: "Download",
        icon: (
          <div className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--accent),transparent_88%)] flex items-center justify-center shrink-0">
            <Download size={13} strokeWidth={2.5} />
          </div>
        ),
        onSelect: () => downloadFeedVideo(video),
      });
    }
    if (follow.available) {
      rows.push({
        id: "follow-channel",
        label: follow.following ? `Unfollow ${video.channel?.trim()}` : `Follow ${video.channel?.trim()}`,
        icon: follow.following ? (
          <UserCheck size={14} className="shrink-0 ml-1.5" />
        ) : (
          <UserPlus size={14} className="shrink-0 ml-1.5" />
        ),
        onSelect: () => void follow.toggle(),
      });
    }
    const channelId = video.channelId;
    const channel = video.channel?.trim();
    if (channelId && channel) {
      rows.push({
        id: "channel",
        label: "Go to channel",
        icon: <CircleUserRound size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => openCreatorPage(channelId, channel),
      });
    }
    rows.push(
      {
        id: "explorer",
        label: "Watch in Explorer",
        icon: <Compass size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => void openUrlInExplorer(video.url),
      },
      {
        id: "copy-link",
        label: "Copy link",
        icon: <Link size={14} className="shrink-0 ml-1.5" />,
        onSelect: () => void copyLink(video.url),
      },
    );
    return rows;
  }, [video, canDownload, follow.available, follow.following, follow.toggle]);
}

/** The same in-card menu downloaded videos get; `mounted` defers the Morph until the card is hot. */
export function FeedVideoMenu({
  video,
  open,
  mounted,
  canDownload,
  onOpenChange,
}: {
  video: FeedVideo;
  open: boolean;
  mounted: boolean;
  canDownload: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const items = useFeedMenuItems(video, canDownload);
  return (
    <div
      className={`relative self-start transition-opacity duration-150 ${
        mounted ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"
      }`}
    >
      {mounted ? (
        <MorphMenu
          open={open}
          onOpenChange={onOpenChange}
          triggerSize={32}
          align="end"
          paintedRest={false}
          aria-label="Video options"
          trigger={<MoreVertical size={16} strokeWidth={2.25} />}
          items={items}
          header={<GalleryMenuTitle text={video.title} />}
        />
      ) : (
        <button
          type="button"
          aria-label="Video options"
          className="flex h-8 w-8 items-center justify-center text-stone-500 hover:text-stone-200"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(true);
          }}
        >
          <MoreVertical size={16} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}

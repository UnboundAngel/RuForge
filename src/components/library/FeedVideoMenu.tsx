import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CircleUserRound, Compass, Download, Link, MoreVertical, UserCheck, UserPlus } from "lucide-react";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { useChannelFollow } from "@/components/watchlist/useChannelFollow";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { openUrlInExplorer } from "@/watchlist/watchlistActions";
import { downloadFeedVideo } from "./downloadFeedVideo";
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

/** The same menu downloaded videos get, for a video that only exists on YouTube so far. */
export function FeedVideoMenu({
  video,
  open,
  at,
  visible,
  canDownload,
  onDownload = downloadFeedVideo,
  onOpen,
  onClose,
}: {
  video: FeedVideo;
  open: boolean;
  at: MenuAt;
  /** Trigger shows on card hover; it stays visible while the menu is open. */
  visible: boolean;
  canDownload: boolean;
  onDownload?: (video: FeedVideo) => void;
  onOpen: (at: MenuAt) => void;
  onClose: () => void;
}) {
  const follow = useChannelFollow(video.channelId, video.channel);
  const channelId = video.channelId;
  const channel = video.channel?.trim();
  const icon = MUSIC_MENU_ICON_SIZE;
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      className={cn(
        "relative self-start transition-opacity duration-150",
        visible || open ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
      )}
    >
      <button
        type="button"
        aria-label="Video options"
        data-tooltip="More options"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
          open ? "text-stone-100 bg-white/[0.08]" : "text-stone-500 hover:text-stone-200",
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (open) onClose();
          else onOpen({ ...menuAnchorPoint(e.currentTarget), placement: "anchor" });
        }}
      >
        <MoreVertical size={16} strokeWidth={2.25} />
      </button>

      <MusicFloatingMenu
        open={open}
        x={at.x}
        y={at.y}
        placement={at.placement}
        theme="library"
        onClose={onClose}
        ariaLabel={`Actions for ${video.title}`}
        measureKey={`${canDownload}:${follow.available}:${follow.following}`}
      >
        <MusicMenuSection label="Watch" tone={MUSIC_MENU_TONES.playback}>
          {canDownload && (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playback}
              label="Download"
              icon={<Download size={icon} strokeWidth={2.25} />}
              onClick={act(() => onDownload(video))}
            />
          )}
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label="Watch in Explorer"
            icon={<Compass size={icon} strokeWidth={2.25} />}
            onClick={act(() => void openUrlInExplorer(video.url))}
          />
        </MusicMenuSection>
        {(follow.available || (channelId && channel)) && (
          <MusicMenuSection label="Channel" tone={MUSIC_MENU_TONES.navigate}>
            {follow.available && (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.navigate}
                label={follow.following ? "Unfollow channel" : "Follow channel"}
                active={follow.following}
                icon={follow.following
                  ? <UserCheck size={icon} strokeWidth={2.25} />
                  : <UserPlus size={icon} strokeWidth={2.25} />}
                onClick={act(() => void follow.toggle())}
              />
            )}
            {channelId && channel && (
              <MusicMenuRow
                tone={MUSIC_MENU_TONES.navigate}
                label="Go to channel"
                icon={<CircleUserRound size={icon} strokeWidth={2.25} />}
                onClick={act(() => openCreatorPage(channelId, channel))}
              />
            )}
          </MusicMenuSection>
        )}
        <MusicMenuSection label="Share" tone={MUSIC_MENU_TONES.file}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.file}
            label="Copy link"
            icon={<Link size={icon} strokeWidth={2.25} />}
            onClick={act(() => void copyLink(video.url))}
          />
        </MusicMenuSection>
      </MusicFloatingMenu>
    </div>
  );
}

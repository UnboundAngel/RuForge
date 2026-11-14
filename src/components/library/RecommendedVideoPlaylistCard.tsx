import { useMemo } from "react";
import { Plus } from "lucide-react";
import { isVideoWatched } from "@/playbackStorage";
import { formatHoursMinutes } from "@/components/playlist-detail/playlistRows";
import { ChannelAvatar, MetaParts, VerifiedMark } from "./VideoByline";
import { useChannelProfile } from "./useChannelProfile";
import { CARD_MARK, PlaylistCard } from "./PlaylistCard";
import type { VideoPlaylistSuggestion } from "./videoPlaylistSuggestions";

/** A channel the library could turn into a playlist, in the universal card: banner cover, avatar mark, Create. */
export function RecommendedVideoPlaylistCard({
  suggestion,
  onCreate,
}: {
  suggestion: VideoPlaylistSuggestion;
  onCreate: () => void;
}) {
  const { files } = suggestion;
  const profile = useChannelProfile(suggestion.channelId);
  const stats = useMemo(() => {
    const newest = [...files].sort((a, b) => (b.youtube?.publishedAt ?? 0) - (a.youtube?.publishedAt ?? 0))[0];
    const runtime = files.reduce((sum, f) => sum + (f.duration || 0), 0);
    const watched = files.filter((f) => isVideoWatched(f.path, f.duration)).length;
    return { newest, runtime, watched };
  }, [files]);
  const fallback = stats.newest?.thumbnailPath || stats.newest?.ruforgePosterPath || null;

  return (
    <PlaylistCard
      cover={profile?.bannerUrl ?? fallback}
      count={`${files.length} videos`}
      mark={
        <ChannelAvatar channelId={suggestion.channelId} channel={suggestion.title} className={`${CARD_MARK} rounded-full`} />
      }
      title={
        <>
          <span className="truncate">{suggestion.title}</span>
          {suggestion.verified ? <VerifiedMark className="h-3.5 w-3.5 shrink-0 text-stone-400" /> : null}
        </>
      }
      meta={
        <MetaParts
          parts={[
            stats.runtime > 0 ? formatHoursMinutes(Math.round(stats.runtime / 60) * 60) : null,
            stats.watched === 0 ? null : `${stats.watched} of ${files.length} watched`,
          ]}
        />
      }
      action={{
        label: "Create",
        ariaLabel: `Create a playlist from ${suggestion.title}`,
        icon: <Plus size={13} strokeWidth={2.75} aria-hidden />,
        onClick: onCreate,
      }}
    />
  );
}

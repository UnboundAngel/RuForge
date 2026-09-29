import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { FollowChannelButton } from "@/components/watchlist/FollowChannelButton";
import { creatorMeta } from "./creatorSections";
import { openChannelInExplorer } from "./openChannel";
import type { ChannelProfile } from "./useChannelProfile";
import { ChannelAvatar, MetaParts, VerifiedMark } from "./VideoByline";

/** YouTube crops channel art to about this band on desktop; matching it keeps the art's framing. */
const BANNER_ASPECT = "aspect-[6.2/1]";

function Banner({ url }: { url: string | null | undefined }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`${BANNER_ASPECT} relative max-h-56 w-full overflow-hidden rounded-[var(--r-outer,24px)] bg-[radial-gradient(120%_140%_at_15%_0%,color-mix(in_srgb,var(--accent),transparent_84%),transparent_60%),linear-gradient(135deg,var(--rf-well-raised),var(--rf-well))]`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}

function HeroAvatar({ url, channelId, channel }: { url: string | null | undefined; channelId: string; channel: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <ChannelAvatar channelId={channelId} channel={channel} className="h-28 w-28 text-4xl!" />;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-28 w-28 shrink-0 rounded-full bg-white/[0.08] object-cover"
    />
  );
}

export function CreatorHeader({
  channelId,
  channel,
  profile,
  downloaded,
}: {
  channelId: string;
  channel: string;
  /** `undefined` while the channel page loads. */
  profile: ChannelProfile | null | undefined;
  downloaded: number;
}) {
  const name = profile?.title?.trim() || channel;
  const meta = creatorMeta(profile, downloaded);
  return (
    <header className="mb-8">
      <Banner url={profile === undefined ? null : profile?.bannerUrl} />
      <div className="mt-6 flex items-center gap-6">
        <HeroAvatar url={profile?.avatarUrl} channelId={channelId} channel={channel} />
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-2.5 text-4xl font-black tracking-tight text-stone-50">
            <span className="truncate">{name}</span>
            {profile?.verified ? <VerifiedMark className="h-5 w-5 text-stone-400" /> : null}
          </h1>
          {meta.length > 0 ? (
            <p className="mt-2 truncate text-sm font-medium text-stone-400">
              <MetaParts parts={meta} />
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-2">
            <FollowChannelButton channelId={channelId} channel={name} />
            <button
              type="button"
              onClick={() => openChannelInExplorer(channelId)}
              className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 text-[12px] font-semibold text-stone-200 transition-colors duration-150 hover:bg-white/[0.12]"
            >
              Open in YouTube
              <ExternalLink size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

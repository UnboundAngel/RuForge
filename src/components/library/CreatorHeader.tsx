import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { FollowChannelButton } from "@/components/watchlist/FollowChannelButton";
import { closeCreatorPage } from "./creatorPageStore";
import { creatorMeta } from "./creatorSections";
import { openChannelInExplorer } from "./openChannel";
import type { ChannelProfile } from "./useChannelProfile";
import { ChannelAvatar, MetaParts, VerifiedMark } from "./VideoByline";

/**
 * Channel art as a backdrop that dissolves into the page, so the name can sit on its lower edge.
 * YouTube crops art to about 6.2:1 on desktop; matching it keeps the creator's framing.
 */
function Backdrop({ url }: { url: string | null | undefined }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative aspect-[6.2/1] max-h-60 min-h-36 w-full overflow-hidden rounded-t-[24px] bg-[radial-gradient(90%_120%_at_20%_0%,color-mix(in_srgb,var(--accent),transparent_80%),transparent_65%),linear-gradient(160deg,var(--rf-well-raised),transparent)] [mask-image:linear-gradient(to_bottom,black_40%,transparent)]">
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
  const frame = "h-32 w-32 shrink-0 rounded-full shadow-[0_12px_32px_rgba(0,0,0,0.45)]";
  if (!url || failed) return <ChannelAvatar channelId={channelId} channel={channel} className={`${frame} text-5xl!`} />;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${frame} bg-white/[0.08] object-cover`}
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
    <header className="mb-10">
      <div className="relative">
        <Backdrop url={profile?.bannerUrl} />
        <button
          type="button"
          onClick={closeCreatorPage}
          aria-label="Back to Library"
          data-tooltip="Back to Library"
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-stone-100 backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-black/50 active:scale-95"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="relative -mt-16 flex items-end gap-6 px-2">
        <HeroAvatar url={profile?.avatarUrl} channelId={channelId} channel={channel} />
        <div className="min-w-0 flex-1 pb-1">
          <h1 className="flex min-w-0 items-center gap-3 text-5xl font-black tracking-tight text-stone-50">
            <span className="truncate">{name}</span>
            {profile?.verified ? <VerifiedMark className="h-6 w-6 text-stone-400" /> : null}
          </h1>
          {meta.length > 0 ? (
            <p className="mt-2 truncate text-sm font-medium text-stone-400">
              <MetaParts parts={meta} />
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6 px-2">
        <FollowChannelButton channelId={channelId} channel={name} variant="cta" />
        <button
          type="button"
          onClick={() => openChannelInExplorer(channelId)}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-400 transition-colors duration-150 hover:text-stone-100"
        >
          Open in YouTube
          <ExternalLink size={13} strokeWidth={2.5} />
        </button>
      </div>
    </header>
  );
}

import { useState, type ReactNode } from "react";
import { FollowChannelButton } from "@/components/watchlist/FollowChannelButton";
import { creatorMeta } from "./creatorSections";
import { openChannelInExplorer } from "./openChannel";
import type { ChannelProfile } from "./useChannelProfile";
import { ChannelAvatar, MetaParts, VerifiedMark } from "./VideoByline";
import { YoutubeMark } from "./YoutubeMark";

function BannerArt({ url }: { url: string | null | undefined }) {
  const [loaded, setLoaded] = useState(false);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}

function HeroAvatar({ url, channelId, channel }: { url: string | null | undefined; channelId: string; channel: string }) {
  const [failed, setFailed] = useState(false);
  const frame = "h-24 w-24 shrink-0 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.5)]";
  if (!url || failed) return <ChannelAvatar channelId={channelId} channel={channel} className={`${frame} text-4xl!`} />;
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

/**
 * One poster card: channel art on top, identity and actions laid over its lower third.
 * The scrim is heavy on purpose; channel art is often bright yellow or white text.
 */
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
    <header className="relative mb-12">
      {/* clip-path, not overflow + radius: WebView2 drops the rounded clip once a child composites. */}
      <div className="relative aspect-[4/1] min-h-56 max-h-80 w-full [clip-path:inset(0_round_24px)] bg-[radial-gradient(80%_140%_at_15%_0%,color-mix(in_srgb,var(--accent),transparent_78%),transparent_70%),linear-gradient(160deg,var(--rf-well-raised),#1a1310)]">
        <BannerArt url={profile?.bannerUrl} />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,rgba(32,28,26,0.97)_0%,rgba(32,28,26,0.78)_38%,rgba(32,28,26,0)_78%)]"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-5 p-6 pr-60">
          <HeroAvatar url={profile?.avatarUrl} channelId={channelId} channel={channel} />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex min-w-0 items-center gap-2.5 text-4xl font-black tracking-tight text-stone-50">
              <span className="truncate">{name}</span>
              {profile?.verified ? <VerifiedMark className="h-5 w-5 shrink-0 text-stone-300" /> : null}
            </h1>
            {meta.length > 0 ? (
              <p className="mt-1.5 truncate text-sm font-medium text-stone-300/80">
                <MetaParts parts={meta} />
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <ActionNotch>
        <button
          type="button"
          onClick={() => openChannelInExplorer(channelId)}
          aria-label="Open in YouTube"
          data-tooltip="Open in YouTube"
          className="flex h-10 w-10 items-center justify-center rounded-[12px] text-stone-500 transition-[color,transform] duration-150 hover:text-stone-100 active:scale-95"
        >
          <YoutubeMark className="h-[22px] w-[22px]" />
        </button>
        <FollowChannelButton channelId={channelId} channel={name} variant="cta" />
      </ActionNotch>
    </header>
  );
}

const CONCAVE = "M16 0V16H0A16 16 0 0 0 16 0Z";

/** The actions sit in a pocket of the well carved out of the banner, joined by the same concave seams as the title band tabs. */
function ActionNotch({ children }: { children: ReactNode }) {
  return (
    <div className="absolute bottom-0 right-0 flex items-center gap-1.5 rounded-tl-[20px] bg-[color:var(--rf-well)] pl-3 pt-3">
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" className="absolute -top-4 right-0 text-[color:var(--rf-well)]">
        <path d={CONCAVE} fill="currentColor" />
      </svg>
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" className="absolute bottom-0 -left-4 text-[color:var(--rf-well)]">
        <path d={CONCAVE} fill="currentColor" />
      </svg>
      {children}
    </div>
  );
}

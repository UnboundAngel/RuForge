import type { MediaFile } from "@/types";
import { ChannelAvatar } from "@/components/library/VideoByline";
import { localImageSrc } from "@/lib/localImageSrc";

type Entry = { key: string; channelId?: string; channel?: string; thumb?: string };

/** Distinct channels first (their avatars say who is in here), topped up with video thumbnails. */
function pickEntries(items: MediaFile[]): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  for (const f of items) {
    const id = f.youtube?.channelId;
    if (id && f.youtube?.channel && !seen.has(id) && out.length < 3) {
      seen.add(id);
      out.push({ key: id, channelId: id, channel: f.youtube.channel });
    }
  }
  for (const f of items) {
    if (out.length >= 3) break;
    const thumb = f.thumbnailPath || f.ruforgePosterPath;
    if (thumb && !out.some((e) => e.thumb === thumb)) out.push({ key: f.path, thumb });
  }
  return out;
}

/** Up to three distinct channels in the playlist's videos, in order of appearance. */
export function distinctChannels(items: readonly MediaFile[], max = 3): { channelId: string; channel: string }[] {
  const out: { channelId: string; channel: string }[] = [];
  for (const f of items) {
    const id = f.youtube?.channelId;
    const name = f.youtube?.channel;
    if (id && name && !out.some((c) => c.channelId === id)) out.push({ channelId: id, channel: name });
    if (out.length >= max) break;
  }
  return out;
}

const RING = "h-7 w-7 ring-2 ring-[color:var(--rf-well)]";

/** Three overlapping circles, each cut by the next, for playlists with 3+ videos. */
export function PlaylistAvatarStack({ items }: { items: MediaFile[] }) {
  if (items.length < 3) return null;
  const entries = pickEntries(items);
  if (entries.length < 3) return null;
  return (
    <div className="flex items-center" aria-hidden>
      {entries.map((e, i) => (
        <div key={e.key} className={i > 0 ? "-ml-2.5" : ""} style={{ zIndex: entries.length - i }}>
          {e.channelId && e.channel ? (
            <ChannelAvatar channelId={e.channelId} channel={e.channel} className={`${RING} relative`} />
          ) : (
            <div className={`${RING} relative overflow-hidden rounded-full bg-stone-800`}>
              <img src={localImageSrc(e.thumb ?? "")} alt="" draggable={false} className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

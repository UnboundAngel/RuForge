import { LazyThumb } from "./LazyThumb";
import { SQUISH_COVER } from "./SquishShelf";
import { Video, Volume2 } from "./icons";
import { addedAgo, type Group } from "../library";
import { fmtDuration, itemMediaType, type CompanionItem } from "../types";

/** The desktop Music fallback note (no cover yet). */
export function NoteIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

export function Art({ item, className, iconSize = 20 }: { item: CompanionItem | null; className: string; iconSize?: number }) {
  const icon =
    item && itemMediaType(item) === "video" ? <Video size={iconSize} strokeWidth={1.25} /> : <NoteIcon size={iconSize} />;
  if (!item) return <div className={className}>{icon}</div>;
  return (
    <LazyThumb id={item.id} hasThumb={item.hasThumb} thumbV={item.thumbV} className={className}>
      {icon}
    </LazyThumb>
  );
}

export function NowPlayingMark() {
  return <Volume2 size={16} className="ph-nowmark" aria-label="Now playing" />;
}

/** Desktop `MusicQuickPickRow` (gradient variant), sized for a two-column phone grid. */
export function QuickPick({ item, active, onPlay }: { item: CompanionItem; active: boolean; onPlay: () => void }) {
  return (
    <button type="button" className={`ph-qp${active ? " ph-qp--active" : ""}`} onClick={onPlay}>
      <Art item={item} className="ph-qp-art" />
      <span className="ph-qp-text">
        <span className="ph-qp-title">{item.title}</span>
        {item.artist ? <span className="ph-qp-sub">{item.artist}</span> : null}
      </span>
      {active ? <NowPlayingMark /> : null}
    </button>
  );
}

/** Desktop `MusicAlbumCard` cover and caption; also used for single songs on shelves. */
export function CoverCard({
  cover,
  title,
  subtitle,
  active,
  disabled,
  onClick,
}: {
  cover: CompanionItem | null;
  title: string;
  subtitle?: string | null;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`ph-cover-card${active ? " ph-cover-card--active" : ""}${disabled ? " ph-cover-card--off" : ""}`}
      onClick={() => { if (!disabled) onClick(); }}
      aria-disabled={disabled}
    >
      <span className="ph-cover-card-art" {...SQUISH_COVER}>
        <Art item={cover} className="ph-fill-art" iconSize={32} />
      </span>
      <span className="ph-cover-card-title">{title}</span>
      {subtitle ? <span className="ph-cover-card-sub">{subtitle}</span> : null}
    </button>
  );
}

/** Desktop `ArtistPill`: circular avatar, bold name, song count. */
export function ArtistCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  return (
    <button type="button" className="ph-artist-card" onClick={onOpen}>
      <span className="ph-artist-card-art" {...SQUISH_COVER}>
        {group.cover?.hasThumb ? (
          <Art item={group.cover} className="ph-fill-art" />
        ) : (
          <span className="ph-artist-initial">{group.title.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="ph-artist-card-name">{group.title}</span>
      <span className="ph-artist-card-sub">{group.subtitle}</span>
    </button>
  );
}

/** Desktop artist-page `AlbumCard`: year badge, song count pill and accent dot over the cover. */
export function ReleaseCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const n = group.items.length;
  return (
    <button type="button" className="ph-release" onClick={onOpen}>
      <span className="ph-release-art">
        <Art item={group.cover} className="ph-fill-art" iconSize={40} />
        <span className="ph-release-shade" aria-hidden />
        {group.year ? <span className="ph-release-year">{group.year}</span> : null}
        <span className="ph-release-foot">
          <span className="ph-release-count">{n} {n === 1 ? "song" : "songs"}</span>
          <span className="ph-release-dot" aria-hidden />
        </span>
      </span>
      <span className="ph-release-title">{group.title}</span>
      <span className="ph-release-kind">Album</span>
    </button>
  );
}

/** Desktop library `AlbumRow`: square cover in a grid cell, title, artist and count. */
export function AlbumGridCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const n = group.items.length;
  return (
    <button type="button" className="ph-album-cell" onClick={onOpen}>
      <span className="ph-album-cell-art">
        <Art item={group.cover} className="ph-fill-art" iconSize={36} />
      </span>
      <span className="ph-album-cell-title">{group.title}</span>
      <span className="ph-album-cell-sub">{group.subtitle} · {n} {n === 1 ? "song" : "songs"}</span>
    </button>
  );
}

/** Desktop library `ArtistRow`. */
export function ArtistRow({ group, onOpen }: { group: Group; onOpen: () => void }) {
  return (
    <button type="button" className="ph-artist-row" onClick={onOpen}>
      <span className="ph-artist-row-art">
        {group.cover?.hasThumb ? (
          <Art item={group.cover} className="ph-fill-art" />
        ) : (
          <span className="ph-artist-initial">{group.title.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="ph-row-text">
        <span className="ph-row-title">{group.title}</span>
        <span className="ph-row-meta">{group.subtitle}</span>
      </span>
    </button>
  );
}

export function AlbumRow({ group, onOpen }: { group: Group; onOpen: () => void }) {
  return (
    <button type="button" className="ph-artist-row" onClick={onOpen}>
      <Art item={group.cover} className="ph-row-art ph-row-art--lg" />
      <span className="ph-row-text">
        <span className="ph-row-title">{group.title}</span>
        <span className="ph-row-meta">Album · {group.subtitle}</span>
      </span>
    </button>
  );
}

/** Desktop `LibraryVideoCard`: 16:9 cover, duration badge, two-line title, channel and age. */
export function VideoCard({
  item,
  active,
  playable,
  shelf,
  onPlay,
}: {
  item: CompanionItem;
  active: boolean;
  playable: boolean;
  shelf?: boolean;
  onPlay: () => void;
}) {
  const meta = playable
    ? [item.artist, addedAgo(item.addedAt)].filter(Boolean).join(" · ")
    : "Can't play on this device";
  return (
    <button
      type="button"
      className={`ph-vcard${shelf ? " ph-vcard--shelf" : ""}${active ? " ph-vcard--active" : ""}${playable ? "" : " ph-vcard--off"}`}
      onClick={() => { if (playable) onPlay(); }}
      aria-disabled={!playable}
    >
      <span className="ph-vcard-art" {...(shelf ? SQUISH_COVER : {})}>
        <Art item={item} className="ph-fill-art" iconSize={44} />
        {item.durationSecs ? <span className="ph-vcard-time">{fmtDuration(item.durationSecs)}</span> : null}
      </span>
      <span className="ph-vcard-title">{item.title}</span>
      {meta ? <span className="ph-vcard-meta">{meta}</span> : null}
    </button>
  );
}

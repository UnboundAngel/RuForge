import { useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { m, useDragControls, type PanInfo } from "motion/react";
import { Art, ReleaseCard, VideoCard } from "./Cards";
import { TrackRow } from "./TrackRow";
import { SaveAllButton } from "./SaveAllButton";
import { ArrowDownUp, ChevronLeft, PlayPauseMorphIcon, Shuffle } from "./icons";
import { useArtTint } from "../artColor";
import { useScrollCompact } from "../useScrollCompact";
import { PRESS_SPRING, PUSH_TRANSITION, SHEET_CLOSE_VELOCITY, enterUp, staggerDelay } from "../motion";
import {
  albumGroups,
  albumsByYear,
  artistKeyOf,
  countLabel,
  isAudio,
  isVideo,
  sortArtistSongs,
  totalLabel,
  type Group,
} from "../library";
import type { ArtistSort, CompanionItem } from "../types";

// iOS home screen apps have no system back swipe, so pages take one from the left edge.
const EDGE_PX = 28;
const BACK_PX = 90;

export function DetailLayer({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const drag = useDragControls();
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left;
    if (e.clientX - left <= EDGE_PX) drag.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > BACK_PX || info.velocity.x > SHEET_CLOSE_VELOCITY) onBack();
  };
  return (
    <m.div
      className="ph-scroll ph-scroll--page"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={PUSH_TRANSITION}
      drag="x"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 1 }}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
    >
      {children}
    </m.div>
  );
}

const SORT_LABEL: Record<ArtistSort, string> = { album: "Album order", recent: "Recently added", title: "Title" };
const SORT_NEXT: Record<ArtistSort, ArtistSort> = { album: "recent", recent: "title", title: "album" };

type Props = {
  group: Group;
  allItems: CompanionItem[];
  activeId: string | null;
  paused: boolean;
  playsHere: (item: CompanionItem) => boolean;
  onBack: () => void;
  onOpen: (group: Group) => void;
  onOpenArtist: (item: CompanionItem) => void;
  onPlay: (item: CompanionItem, list: CompanionItem[], context: string) => void;
  onShuffle: (list: CompanionItem[], context: string) => void;
  onTogglePlay: () => void;
};

export function DetailPage(props: Props) {
  const { group, allItems, activeId, paused, playsHere, onBack, onOpen, onOpenArtist, onPlay, onShuffle, onTogglePlay } = props;
  const { ref, compact } = useScrollCompact<HTMLDivElement>();
  const tint = useArtTint(group.cover);
  const [sort, setSort] = useState<ArtistSort>("album");

  const artistKey = group.kind === "artist" ? group.key.slice("artist:".length) : null;
  const albums = useMemo(() => {
    if (!artistKey) return [];
    const audio = allItems.filter((i) => isAudio(i) && playsHere(i) && artistKeyOf(i) === artistKey);
    return albumsByYear(albumGroups(audio));
  }, [allItems, artistKey, playsHere]);

  const rows = useMemo(
    () => (group.kind === "artist" ? sortArtistSongs(group.items, albums, sort) : group.items),
    [group, albums, sort],
  );
  const playable = rows.filter(playsHere);
  const playingHere = activeId !== null && group.items.some((i) => i.id === activeId);
  const videosOnly = group.items.length > 0 && group.items.every(isVideo);

  const stats = [
    countLabel(group.items),
    albums.length > 0 ? `${albums.length} ${albums.length === 1 ? "album" : "albums"}` : null,
    totalLabel(group.items),
  ].filter(Boolean).join(" · ");

  const style = tint ? ({ "--page-tint": tint.deep } as CSSProperties) : undefined;
  const title = group.title;

  const controls = (
    <div className="ph-detail-actions">
      <m.button
        type="button"
        className="ph-bigplay"
        disabled={playable.length === 0}
        onClick={() => (playingHere ? onTogglePlay() : playable[0] && onPlay(playable[0], playable, title))}
        aria-label={playingHere && !paused ? `Pause ${title}` : `Play ${title}`}
        whileTap={{ scale: 0.92 }}
        transition={PRESS_SPRING}
      >
        <PlayPauseMorphIcon playing={playingHere && !paused} size={24} />
      </m.button>
      <button
        type="button"
        className="ph-source-btn"
        onClick={() => onShuffle(playable, title)}
        disabled={playable.length === 0}
        aria-label={`Shuffle ${title}`}
      >
        <Shuffle size={26} />
      </button>
      <SaveAllButton items={playable} label={title} />
    </div>
  );

  return (
    <div className={`ph-detail ph-detail--${group.kind}`} style={style} ref={ref}>
      <div className={`ph-detail-bar${compact ? " ph-detail-bar--solid" : ""}`}>
        <button type="button" className="ph-back" onClick={onBack} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={2.25} />
        </button>
        <span className="ph-detail-bar-title">{title}</span>
      </div>

      {group.kind === "artist" ? (
        <header className="ph-hero">
          <Art item={group.cover} className="ph-hero-img" iconSize={64} />
          <span className="ph-hero-scrim" aria-hidden />
          <div className="ph-hero-text">
            <h1 className="ph-hero-title">{title}</h1>
            <p className="ph-hero-meta">{stats}</p>
          </div>
        </header>
      ) : group.kind === "album" ? (
        <header className="ph-album-head">
          <m.div
            className="ph-album-cover"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <Art item={group.cover} className="ph-fill-art" iconSize={56} />
          </m.div>
          <h1 className="ph-album-title">{title}</h1>
          <button type="button" className="ph-album-artist" onClick={() => group.items[0] && onOpenArtist(group.items[0])}>
            {group.subtitle}
          </button>
          <p className="ph-album-meta">
            Album{group.year ? ` · ${group.year}` : ""} · {countLabel(group.items)} · {totalLabel(group.items)}
          </p>
        </header>
      ) : (
        <header className="ph-collection-head">
          <h1 className="ph-hero-title">{title}</h1>
          <p className="ph-hero-meta">{stats}</p>
        </header>
      )}

      <div className="ph-detail-body">
        {videosOnly ? null : controls}

        {albums.length > 0 ? (
          <section className="ph-detail-section">
            <h2 className="ph-section-label">Albums</h2>
            <div className="ph-release-grid">
              {albums.map((a) => <ReleaseCard key={a.key} group={a} onOpen={() => onOpen(a)} />)}
            </div>
          </section>
        ) : null}

        {videosOnly ? (
          <div className="ph-vfeed">
            {group.items.map((item) => (
              <VideoCard key={item.id} item={item} active={item.id === activeId} playable={playsHere(item)} onPlay={() => onPlay(item, playable, title)} />
            ))}
          </div>
        ) : (
          <section className="ph-detail-section">
            {group.kind === "artist" ? (
              <div className="ph-section-head">
                <h2 className="ph-section-label">Songs</h2>
                <button type="button" className="ph-sort" onClick={() => setSort(SORT_NEXT[sort])}>
                  <ArrowDownUp size={14} strokeWidth={2.25} />
                  {SORT_LABEL[sort]}
                </button>
              </div>
            ) : null}
            <m.div key={sort} className="ph-list">
              {rows.map((item, i) => (
                <m.div
                  key={item.id}
                  {...enterUp}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1], delay: 0.08 + staggerDelay(i) }}
                >
                  <TrackRow
                    item={item}
                    index={group.kind === "collection" ? undefined : i}
                    meta={group.kind === "artist" ? item.album ?? null : undefined}
                    active={item.id === activeId}
                    playable={playsHere(item)}
                    onPlay={() => onPlay(item, playable, title)}
                  />
                </m.div>
              ))}
            </m.div>
          </section>
        )}
      </div>
    </div>
  );
}

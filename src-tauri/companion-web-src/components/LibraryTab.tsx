import { memo, useMemo, useState } from "react";
import { m } from "motion/react";
import { enterUp, pageTransition } from "../motion";
import { AlbumGridCard, ArtistRow, VideoCard } from "./Cards";
import { TrackRow } from "./TrackRow";
import { ArrowDownUp, HardDrive, Search } from "./icons";
import { SaveAllButton } from "./SaveAllButton";
import { openIntro } from "../intro";
import { useOfflineState } from "../offlineStore";
import { useScrollCompact } from "../useScrollCompact";
import { albumGroups, artistGroups, byArtist, byRecent, byTitle, isAudio, isVideo, type Group } from "../library";
import type { CompanionItem, LibraryChip, LibrarySort } from "../types";

const TABS: Array<{ id: LibraryChip; label: string }> = [
  { id: "songs", label: "Songs" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
  { id: "videos", label: "Videos" },
];

const SORT_LABEL: Record<LibrarySort, string> = { recent: "Recently added", title: "Title", artist: "Artist" };
const SORT_NEXT: Record<LibrarySort, LibrarySort> = { recent: "title", title: "artist", artist: "recent" };

type Props = {
  items: CompanionItem[];
  chip: LibraryChip;
  sort: LibrarySort;
  activeId: string | null;
  playsHere: (item: CompanionItem) => boolean;
  onChip: (c: LibraryChip) => void;
  onSort: (s: LibrarySort) => void;
  onSearch: () => void;
  onPlay: (item: CompanionItem, list: CompanionItem[], context: string) => void;
  onOpen: (group: Group) => void;
};

function sorted(pool: CompanionItem[], sort: LibrarySort) {
  return sort === "title" ? byTitle(pool) : sort === "artist" ? byArtist(pool) : byRecent(pool);
}

export const LibraryTab = memo(function LibraryTab({ items: allItems, chip, sort, activeId, playsHere, onChip, onSort, onSearch, onPlay, onOpen }: Props) {
  const { ref, compact } = useScrollCompact<HTMLDivElement>();
  const { saved } = useOfflineState();
  const [savedOnly, setSavedOnly] = useState(false);
  const items = useMemo(() => (savedOnly ? allItems.filter((i) => saved.has(i.id)) : allItems), [allItems, savedOnly, saved]);

  const lib = useMemo(() => {
    const audio = items.filter(isAudio);
    const playableAudio = byRecent(audio.filter(playsHere));
    return {
      songs: sorted(audio, sort),
      videos: sorted(items.filter(isVideo), sort),
      albums: albumGroups(playableAudio),
      artists: [...artistGroups(playableAudio)].sort((a, b) => a.title.localeCompare(b.title)),
    };
  }, [items, sort, playsHere]);

  const list = chip === "videos" ? lib.videos : lib.songs;
  const playable = list.filter(playsHere);
  const count =
    chip === "songs" ? `${lib.songs.length} songs`
    : chip === "videos" ? `${lib.videos.length} videos`
    : chip === "albums" ? `${lib.albums.length} albums`
    : `${lib.artists.length} artists`;

  return (
    <div className="ph-libtab" ref={ref}>
      <header className="ph-libhead ph-pad-x">
        <img className="ph-avatar" src="/apple-touch-icon.png" alt="" draggable={false} />
        <h1 className="ph-libtitle">Your Library</h1>
        <button type="button" className="ph-icon-btn" onClick={() => openIntro("storage")} aria-label="Downloads and storage">
          <HardDrive size={22} strokeWidth={2.25} />
        </button>
        <button type="button" className="ph-icon-btn" onClick={onSearch} aria-label="Search">
          <Search size={22} strokeWidth={2.25} />
        </button>
      </header>

      <div className="ph-topbar ph-topbar--tabs">
        <div className={`ph-libtabs${compact ? " ph-libtabs--compact" : ""}`} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={chip === t.id}
              className={`ph-libtab-btn${chip === t.id ? " ph-libtab-btn--on" : ""}`}
              onClick={() => onChip(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ph-sortbar ph-pad-x">
        <div className="ph-sortbar-actions">
          {chip === "songs" || chip === "videos" ? (
            <button type="button" className="ph-sort" onClick={() => onSort(SORT_NEXT[sort])}>
              <ArrowDownUp size={14} strokeWidth={2.25} />
              {SORT_LABEL[sort]}
            </button>
          ) : null}
          <button
            type="button"
            className={`ph-saved-pill${savedOnly ? " ph-saved-pill--on" : ""}`}
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly((v) => !v)}
          >
            Saved
          </button>
          {chip === "songs" || chip === "videos" ? (
            <SaveAllButton items={playable} label={chip === "videos" ? "your videos" : "your songs"} className="ph-saved-pill" withText />
          ) : null}
        </div>
        <span className="ph-sortbar-count">{count}</span>
      </div>

      <m.div key={`${chip}:${sort}`} {...enterUp} transition={pageTransition}>
        {chip === "songs" ? (
          lib.songs.length === 0 ? (
            <p className="ph-empty ph-pad-x">No songs on your PC yet.</p>
          ) : (
            <div className="ph-list ph-pad-x">
              {lib.songs.map((item) => (
                <TrackRow
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  playable={playsHere(item)}
                  onPlay={() => onPlay(item, playable, "Your songs")}
                />
              ))}
            </div>
          )
        ) : null}

        {chip === "albums" ? (
          lib.albums.length === 0 ? (
            <p className="ph-empty ph-pad-x">Albums show up once two or more songs share an album tag.</p>
          ) : (
            <div className="ph-album-grid ph-pad-x">
              {lib.albums.map((g) => <AlbumGridCard key={g.key} group={g} onOpen={() => onOpen(g)} />)}
            </div>
          )
        ) : null}

        {chip === "artists" ? (
          lib.artists.length === 0 ? (
            <p className="ph-empty ph-pad-x">Artists show up once your songs have artist tags.</p>
          ) : (
            <div className="ph-list ph-pad-x">
              {lib.artists.map((g) => <ArtistRow key={g.key} group={g} onOpen={() => onOpen(g)} />)}
            </div>
          )
        ) : null}

        {chip === "videos" ? (
          lib.videos.length === 0 ? (
            <p className="ph-empty ph-pad-x">No videos on your PC yet.</p>
          ) : (
            <div className="ph-vfeed ph-pad-x">
              {lib.videos.map((item) => (
                <VideoCard
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  playable={playsHere(item)}
                  onPlay={() => onPlay(item, playable, "Your videos")}
                />
              ))}
            </div>
          )
        ) : null}
      </m.div>
    </div>
  );
});

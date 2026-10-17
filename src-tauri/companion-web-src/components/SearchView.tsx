import { memo, useMemo, useState } from "react";
import { useOfflineState } from "../offlineStore";
import { AlbumRow, ArtistRow } from "./Cards";
import { LazyThumb } from "./LazyThumb";
import { SaveAllButton } from "./SaveAllButton";
import { TrackRow } from "./TrackRow";
import { Search, X } from "./icons";
import { albumGroups, artistGroups, byRecent, collection, isAudio, isVideo, longMixes, type Group } from "../library";
import type { CompanionItem, LibraryChip } from "../types";

const GROUP_HITS = 3;

type Props = {
  items: CompanionItem[];
  query: string;
  activeId: string | null;
  playsHere: (item: CompanionItem) => boolean;
  onQuery: (q: string) => void;
  onPlay: (item: CompanionItem, list: CompanionItem[], context: string) => void;
  onOpen: (group: Group) => void;
  onBrowse: (chip: LibraryChip) => void;
};

type Tile = { label: string; cover: CompanionItem | null; go: () => void };

export const SearchView = memo(function SearchView({ items: allItems, query, activeId, playsHere, onQuery, onPlay, onOpen, onBrowse }: Props) {
  const q = query.trim().toLowerCase();
  const saved = useOfflineState().saved;
  const [savedOnly, setSavedOnly] = useState(false);
  const items = useMemo(() => (savedOnly ? allItems.filter((i) => saved.has(i.id)) : allItems), [allItems, saved, savedOnly]);

  const lib = useMemo(() => {
    const ok = items.filter(playsHere);
    const audio = byRecent(ok.filter(isAudio));
    const videos = byRecent(ok.filter(isVideo));
    return { audio, videos, artists: artistGroups(audio), albums: albumGroups(audio), mixes: longMixes(audio) };
  }, [items, playsHere]);

  const hits = useMemo(() => {
    if (!q) return null;
    const match = (s?: string | null) => (s ?? "").toLowerCase().includes(q);
    const tracks = items.filter((i) => match(i.title) || match(i.artist) || match(i.album));
    return {
      artists: lib.artists.filter((g) => match(g.title)).slice(0, GROUP_HITS),
      albums: lib.albums.filter((g) => match(g.title)).slice(0, GROUP_HITS),
      tracks,
    };
  }, [items, lib, q]);

  const tiles: Tile[] = [
    { label: "Songs", cover: lib.audio[0] ?? null, go: () => onBrowse("songs") },
    { label: "Videos", cover: lib.videos[0] ?? null, go: () => onBrowse("videos") },
    { label: "Artists", cover: lib.artists[0]?.cover ?? null, go: () => onBrowse("artists") },
    { label: "Albums", cover: lib.albums[0]?.cover ?? null, go: () => onBrowse("albums") },
    { label: "Recently added", cover: lib.audio[1] ?? null, go: () => onOpen(collection("recent", "Recently added", lib.audio.slice(0, 50))) },
    { label: "Long listens", cover: lib.mixes[0] ?? null, go: () => onOpen(collection("long", "Long listens", lib.mixes)) },
  ].filter((t) => t.label !== "Long listens" || lib.mixes.length > 0);

  const playableHits = hits?.tracks.filter(playsHere) ?? [];
  const nothing = hits && hits.artists.length + hits.albums.length + hits.tracks.length === 0;

  return (
    <div className="ph-searchtab">
      <header className="ph-search-head ph-pad-x">
        <h1 className="ph-libtitle">Search</h1>
        <label className="ph-search">
          <Search size={18} strokeWidth={2.25} />
          <input
            className="ph-search-input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="What do you want to play?"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Search your library"
          />
          {query ? (
            <button type="button" className="ph-search-clear" onClick={() => onQuery("")} aria-label="Clear search">
              <X size={16} strokeWidth={2.25} />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          className={`ph-search-saved${savedOnly ? " ph-search-saved--on" : ""}`}
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly((v) => !v)}
        >
          Saved on this phone
        </button>
      </header>

      {!hits ? (
        <section className="ph-pad-x">
          <h2 className="ph-shelf-title ph-shelf-title--flush">Browse all</h2>
          <div className="ph-browse">
            {tiles.map((t, i) => (
              <button key={t.label} type="button" className={`ph-browse-tile ph-browse-tile--${i % 6}`} onClick={t.go}>
                <span className="ph-browse-label">{t.label}</span>
                {t.cover ? <LazyThumb id={t.cover.id} hasThumb={t.cover.hasThumb} thumbV={t.cover.thumbV} className="ph-browse-art" /> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {nothing ? <p className="ph-empty ph-pad-x">Nothing matches "{query.trim()}".</p> : null}

      {hits && playableHits.length > 0 ? (
        <div className="ph-search-actions ph-pad-x">
          <SaveAllButton items={playableHits} label={`results for "${query.trim()}"`} className="ph-saved-pill" withText />
        </div>
      ) : null}

      {hits ? (
        <div className="ph-list ph-pad-x">
          {hits.artists.map((g) => <ArtistRow key={g.key} group={g} onOpen={() => onOpen(g)} />)}
          {hits.albums.map((g) => <AlbumRow key={g.key} group={g} onOpen={() => onOpen(g)} />)}
          {hits.tracks.map((item) => (
            <TrackRow
              key={item.id}
              item={item}
              active={item.id === activeId}
              playable={playsHere(item)}
              kindLabel
              onPlay={() => onPlay(item, playableHits, "Search")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

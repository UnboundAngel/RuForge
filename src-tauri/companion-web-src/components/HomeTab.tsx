import { memo, useMemo } from "react";
import { m } from "motion/react";
import { enterUp, pageTransition } from "../motion";
import { ArtistCard, CoverCard, QuickPick, VideoCard } from "./Cards";
import { FilterPills, type FilterOption } from "./FilterPills";
import { Shelf } from "./SquishShelf";
import { Music2, RfIcon } from "./icons";
import { useScrollCompact } from "../useScrollCompact";
import { albumGroups, artistGroups, byRecent, collection, isAudio, isVideo, longMixes, type Group } from "../library";
import type { CompanionItem, HomeChip } from "../types";

const QUICK_PICKS = 8;
const SHELF_MAX = 12;

export const HOME_FILTERS: FilterOption<HomeChip>[] = [
  { id: "all", label: "All", accent: "", accentBg: "", accentBgMuted: "#2a2a2a" },
  {
    id: "music",
    label: "Music",
    icon: <Music2 size={14} strokeWidth={2.25} />,
    accent: "#ff5c7a",
    accentBg: "#c4002a",
    accentBgMuted: "#3d1219",
  },
  {
    id: "videos",
    label: "Videos",
    icon: <RfIcon name="playCircle" size={15} />,
    accent: "#ff5c7a",
    accentBg: "#c4002a",
    accentBgMuted: "#3d1219",
  },
];

type Props = {
  items: CompanionItem[];
  recentIds: string[];
  chip: HomeChip;
  activeId: string | null;
  refreshing: boolean;
  playsHere: (item: CompanionItem) => boolean;
  onChip: (c: HomeChip) => void;
  onPlay: (item: CompanionItem, list: CompanionItem[], context: string) => void;
  onOpen: (group: Group) => void;
};

export const HomeTab = memo(function HomeTab({ items, recentIds, chip, activeId, refreshing, playsHere, onChip, onPlay, onOpen }: Props) {
  const { ref, compact } = useScrollCompact<HTMLDivElement>();

  const data = useMemo(() => {
    const ok = items.filter(playsHere);
    const audio = byRecent(ok.filter(isAudio));
    const videos = byRecent(ok.filter(isVideo));
    const byId = new Map(ok.map((i) => [i.id, i]));
    const history = recentIds.map((id) => byId.get(id)).filter((i): i is CompanionItem => !!i);
    return {
      audio,
      videos,
      history,
      watched: history.filter(isVideo),
      artists: artistGroups(audio),
      albums: albumGroups(audio),
      mixes: longMixes(audio),
    };
  }, [items, recentIds, playsHere]);

  const quickPicks = useMemo(() => {
    const pool = chip === "all" ? [...data.audio, ...data.videos] : data.audio;
    const allowed = new Set(pool.map((i) => i.id));
    const seen = new Set<string>();
    const out: CompanionItem[] = [];
    for (const item of [...data.history, ...pool]) {
      if (out.length >= QUICK_PICKS) break;
      if (!allowed.has(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }, [chip, data]);

  const empty = items.length === 0;
  const videoMode = chip === "videos";

  return (
    <div className="ph-home" ref={ref}>
      <header className="ph-topbar">
        <img className={`ph-avatar${compact ? " ph-avatar--hidden" : ""}`} src="/apple-touch-icon.png" alt="" draggable={false} />
        <FilterPills value={chip} options={HOME_FILTERS} compact={compact} onChange={onChip} />
      </header>

      <m.div key={chip} {...enterUp} transition={pageTransition} className="ph-home-body">
        {empty ? (
          <div className="ph-pad-x">
            <h1 className="ph-title">{refreshing ? "Loading your library" : "Nothing here yet"}</h1>
            <p className="ph-sub">
              {refreshing
                ? "RuForge is reading your library on your PC."
                : "Songs and videos you download with RuForge on your PC show up here."}
            </p>
          </div>
        ) : null}

        {!videoMode && quickPicks.length >= 2 ? (
          <div className="ph-qp-grid ph-pad-x">
            {quickPicks.map((item) => (
              <QuickPick
                key={item.id}
                item={item}
                active={item.id === activeId}
                onPlay={() => onPlay(item, quickPicks, "Quick picks")}
              />
            ))}
          </div>
        ) : null}

        {!videoMode ? (
          <>
            {data.audio.length > 0 ? (
              <Shelf title="Recently added">
                {data.audio.slice(0, SHELF_MAX).map((item) => (
                  <CoverCard
                    key={item.id}
                    cover={item}
                    title={item.title}
                    subtitle={item.artist}
                    active={item.id === activeId}
                    onClick={() => onPlay(item, data.audio, "Recently added")}
                  />
                ))}
              </Shelf>
            ) : null}

            {data.artists.length > 0 ? (
              <Shelf title="Artists">
                {data.artists.slice(0, SHELF_MAX).map((g) => (
                  <ArtistCard key={g.key} group={g} onOpen={() => onOpen(g)} />
                ))}
              </Shelf>
            ) : null}

            {data.albums.length > 0 ? (
              <Shelf title="Albums">
                {data.albums.slice(0, SHELF_MAX).map((g) => (
                  <CoverCard key={g.key} cover={g.cover} title={g.title} subtitle={g.subtitle} onClick={() => onOpen(g)} />
                ))}
              </Shelf>
            ) : null}

            {data.mixes.length > 0 ? (
              <Shelf title="Long listens">
                {data.mixes.slice(0, SHELF_MAX).map((item) => (
                  <CoverCard
                    key={item.id}
                    cover={item}
                    title={item.title}
                    subtitle={item.artist}
                    active={item.id === activeId}
                    onClick={() => onPlay(item, data.mixes, "Long listens")}
                  />
                ))}
              </Shelf>
            ) : null}

            {chip === "all" && data.videos.length > 0 ? (
              <Shelf
                title="Videos"
                action={
                  data.videos.length > SHELF_MAX ? (
                    <button type="button" className="ph-see-all" onClick={() => onChip("videos")}>
                      See all
                    </button>
                  ) : undefined
                }
              >
                {data.videos.slice(0, SHELF_MAX).map((item) => (
                  <VideoCard key={item.id} item={item} shelf active={item.id === activeId} playable onPlay={() => onPlay(item, data.videos, "Videos")} />
                ))}
              </Shelf>
            ) : null}
          </>
        ) : (
          <>
            {data.watched.length > 0 ? (
              <Shelf title="Keep watching">
                {data.watched.slice(0, SHELF_MAX).map((item) => (
                  <VideoCard key={item.id} item={item} shelf active={item.id === activeId} playable onPlay={() => onPlay(item, data.watched, "Keep watching")} />
                ))}
              </Shelf>
            ) : null}
            <section className="ph-shelf">
              <div className="ph-shelf-head">
                <h2 className="ph-shelf-title">Latest downloads</h2>
                {data.videos.length > 0 ? (
                  <button type="button" className="ph-see-all" onClick={() => onOpen(collection("videos", "Videos", data.videos))}>
                    {data.videos.length} videos
                  </button>
                ) : null}
              </div>
              {data.videos.length === 0 ? (
                <p className="ph-empty ph-pad-x">Videos you download with RuForge show up here.</p>
              ) : (
                <div className="ph-vfeed ph-pad-x">
                  {data.videos.map((item) => (
                    <VideoCard key={item.id} item={item} active={item.id === activeId} playable onPlay={() => onPlay(item, data.videos, "Videos")} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </m.div>
    </div>
  );
});

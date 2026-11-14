import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from "react";
import { nextVideoPlaylistTitle } from "@/lib/playlistRecordOps";
import { ArrowUpDown, Check, ChevronDown, Plus } from "lucide-react";
import type { MediaFile, PlaylistCollection } from "@/types";
import { playlistLastPlayedAt } from "@/lib/playlistSession";
import { isVirtualPlaylistPath, parseVirtualPlaylistId, virtualPlaylistPath } from "@/virtualPlaylists";
import { markFreshPlaylist } from "@/lib/freshPlaylist";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { PlaylistStackCard } from "@/components/PlaylistStackCard";
import { isDemoPlaylistPath } from "@/lib/demoPlaylistPath";
import { DemoPlaylistCardShell } from "./DemoPlaylistCardShell";
import { dropUrlsOnPlaylist, playlistDropSummary } from "./playlistUrlDrop";
import { PLAYLISTS_SORT_OPTIONS, sortPlaylists, type PlaylistsSortMode } from "./playlistSort";
import { RecommendedVideoPlaylists } from "./RecommendedVideoPlaylists";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { useOnboardingMock } from "@/lib/useOnboardingMockPlaylists";

/** The Playlists page: header with New and sort, the card grid, then recommendations. */
export function PlaylistsSection({
  headerRef,
  playlists,
  libraryFiles,
  emptyCopy,
  gridClassName,
  gridStyle,
  recommendedGameCards,
  onOpen,
  onCardMenu,
}: {
  /** The library's scroll-faded header slot; this page's title and controls live in it. */
  headerRef: Ref<HTMLDivElement>;
  playlists: PlaylistCollection[];
  libraryFiles: readonly MediaFile[];
  emptyCopy: string;
  gridClassName: string;
  gridStyle: CSSProperties;
  /** The games extra's own shelf; ours goes under it, at the very bottom. */
  recommendedGameCards: ReactNode;
  onOpen: (playlist: PlaylistCollection) => void;
  onCardMenu: (e: MouseEvent, playlist: PlaylistCollection) => void;
}) {
  const notify = useRuforgeStore((s) => s.notify);
  const createVirtualPlaylist = useRuforgeStore((s) => s.createVirtualPlaylist);
  const listVirtualPlaylistRecords = useRuforgeStore((s) => s.listVirtualPlaylistRecords);
  // One action, so no menu: open the new playlist straight away with its name ready to type.
  const onNew = () => {
    const title = nextVideoPlaylistTitle(listVirtualPlaylistRecords().filter((r) => r.kind !== "music"));
    const path = virtualPlaylistPath(createVirtualPlaylist(title));
    markFreshPlaylist(path);
    onOpen({ kind: "playlist", title, path, itemCount: 0, combinedDuration: 0, stackThumbnailPath: null, items: [] });
  };
  // Not persisted: the page opens on the default order every launch.
  const [mode, setMode] = useState<PlaylistsSortMode>("recent");
  const [sortAt, setSortAt] = useState<MenuAt | null>(null);
  const icon = MUSIC_MENU_ICON_SIZE;
  // A forced preview shows the demo card alone, so the user's own shelves stay out of the capture.
  const mock = useOnboardingMock();
  const forcedDemo = mock.kind === "video-playlists" && mock.forced;

  const sorted = useMemo(
    () => {
      const list = sortPlaylists(playlists, mode, playlistLastPlayedAt);
      // The tour's demo card always leads, so "the first card" is the one it points at.
      return [...list.filter((p) => isDemoPlaylistPath(p.path)), ...list.filter((p) => !isDemoPlaylistPath(p.path))];
    },
    // Session changes only matter while sorting by play time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlists, mode],
  );
  const existingTitles = useMemo(() => playlists.map((p) => p.title), [playlists]);
  const sortLabel = PLAYLISTS_SORT_OPTIONS.find((o) => o.mode === mode)?.label ?? "";

  return (
    <>
      <section>
        <div ref={headerRef} className="flex items-end justify-between gap-4 pb-8 pt-16">
          <h1 className="text-3xl font-black tracking-tight text-stone-50">Playlists</h1>
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label="Sort playlists"
              aria-haspopup="menu"
              aria-expanded={sortAt != null}
              onClick={(e) =>
                setSortAt(sortAt ? null : { ...menuAnchorPoint(e.currentTarget, "end"), placement: "anchor" })
              }
              className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                sortAt ? "text-stone-200" : "text-stone-500 hover:text-stone-200"
              }`}
            >
              {sortLabel}
              <ChevronDown size={12} />
            </button>
            <button
              type="button"
              onClick={onNew}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.08] pl-3 pr-4 text-[12px] font-semibold text-stone-100 transition-colors duration-150 hover:bg-[color:var(--accent)] hover:text-[color:var(--rf-on-accent)]"
            >
              <Plus size={15} strokeWidth={2.5} />
              New playlist
            </button>
          </div>
        </div>
        {sorted.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-stone-400 font-medium text-sm">{emptyCopy}</p>
            <button
              type="button"
              onClick={onNew}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] text-[11px] font-semibold text-stone-200 hover:bg-white/[0.1] transition-colors"
            >
              <Plus size={12} />
              Create playlist
            </button>
          </div>
        ) : (
          <div className={gridClassName} style={gridStyle}>
            {sorted.map((entry, index) => {
              const id = isVirtualPlaylistPath(entry.path) ? parseVirtualPlaylistId(entry.path) : null;
              const demo = isDemoPlaylistPath(entry.path);
              const card = (
                <PlaylistStackCard
                  key={entry.path}
                  playlist={entry}
                  targetId={index === 0 ? "playlist-card-first" : undefined}
                  onClick={() => onOpen(entry)}
                  onContextMenu={(e) => (demo ? e.preventDefault() : onCardMenu(e, entry))}
                  onUrlDrop={
                    id
                      ? (dt) => {
                          notify("Reading dropped links...");
                          void dropUrlsOnPlaylist(id, dt).then((r) => notify(playlistDropSummary(r, entry.title)));
                        }
                      : undefined
                  }
                />
              );
              return demo ? <DemoPlaylistCardShell key={entry.path}>{card}</DemoPlaylistCardShell> : card;
            })}
          </div>
        )}
      </section>

      {!forcedDemo && (
        <RecommendedVideoPlaylists
          files={libraryFiles}
          existingTitles={existingTitles}
          gameCards={recommendedGameCards}
          gridClassName={gridClassName}
          gridStyle={gridStyle}
        />
      )}

      <MusicFloatingMenu
        open={sortAt != null}
        x={sortAt?.x ?? 0}
        y={sortAt?.y ?? 0}
        placement="anchor"
        theme="library"
        onClose={() => setSortAt(null)}
        ariaLabel="Sort playlists"
      >
        <MusicMenuSection label="Sort by" tone={MUSIC_MENU_TONES.navigate}>
          {PLAYLISTS_SORT_OPTIONS.map((o) => (
            <MusicMenuRow
              key={o.mode}
              tone={MUSIC_MENU_TONES.navigate}
              label={o.label}
              active={mode === o.mode}
              icon={<ArrowUpDown size={icon} strokeWidth={2.25} />}
              trailing={
                mode === o.mode ? (
                  <Check size={12} strokeWidth={2.5} className="shrink-0 text-[color:var(--accent)]" aria-hidden />
                ) : null
              }
              onClick={() => {
                setMode(o.mode);
                setSortAt(null);
              }}
            />
          ))}
        </MusicMenuSection>
      </MusicFloatingMenu>
    </>
  );
}

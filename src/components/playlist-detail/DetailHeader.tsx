import { forwardRef, useEffect, useRef, useState } from "react";
import { ChevronLeft, Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { PlaylistCollection } from "@/types";
import { playlistDisplayTitle } from "@/lib/playlistDisplayTitle";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { CoverPlate, type UpNext } from "./CoverPlate";
import { PlaylistAvatarStack } from "./PlaylistAvatarStack";
import { formatHoursMinutes } from "./playlistRows";
import { SeasonButtons } from "./SeasonButtons";

type Props = {
  playlist: PlaylistCollection;
  sessionId: string;
  started: boolean;
  isVideoPlaylist: boolean;
  /** The onboarding demo: labelled, and nothing on the page edits or plays. */
  demo?: boolean;
  /** A row is being dragged over the cover. */
  coverArmed: boolean;
  /** A row is being dragged anywhere, so the cover shows itself as the drop target. */
  rowDragging: boolean;
  dragTitle?: string;
  /** Thumbnail of the start video; shown as the cover while one is set. */
  startThumb?: string;
  /** What clicking the cover plays, shown on hover. */
  upNext: UpNext | null;
  onBack: () => void;
  onPlayCover: () => void;
  /** Open with the name selected for typing (a playlist just made with New). */
  renameOnMount: boolean;
  onRename: (title: string) => void;
  onMarkAll: (watched: boolean) => void;
  onRemoveWatched: () => void;
};

export const DetailHeader = forwardRef<HTMLDivElement, Props>(function DetailHeader(
  {
    playlist,
    sessionId,
    started,
    isVideoPlaylist,
    demo,
    coverArmed,
    rowDragging,
    dragTitle,
    startThumb,
    upNext,
    onBack,
    onPlayCover,
    renameOnMount,
    onRename,
    onMarkAll,
    onRemoveWatched,
  },
  coverRef,
) {
  const [menuAt, setMenuAt] = useState<MenuAt | null>(null);
  const icon = MUSIC_MENU_ICON_SIZE;
  const empty = playlist.items.length === 0;
  const cover =
    startThumb ||
    playlist.stackThumbnailPath || playlist.items[0]?.thumbnailPath || playlist.items[0]?.ruforgePosterPath;
  const close = () => setMenuAt(null);
  const [renaming, setRenaming] = useState(renameOnMount && !demo);
  // Shown until the playlist prop catches up with the store after a rename.
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const shownTitle = playlistDisplayTitle(savedTitle ?? playlist.title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
  }, [renaming]);
  const finishRename = (commit: boolean) => {
    const next = inputRef.current?.value.trim() ?? "";
    setRenaming(false);
    if (!commit || !next || next === shownTitle) return;
    setSavedTitle(next);
    onRename(next);
  };
  const act = (fn: () => void) => () => {
    close();
    fn();
  };

  const optionsButton = (
    <button
      type="button"
      aria-label="Playlist options"
      aria-haspopup="menu"
      aria-expanded={menuAt != null}
      data-tooltip="Playlist options"
      onClick={(e) =>
        setMenuAt(menuAt ? null : { ...menuAnchorPoint(e.currentTarget, "end"), placement: "anchor" })
      }
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
        menuAt ? "bg-white/[0.1] text-stone-100" : "bg-white/[0.06] text-stone-200 hover:bg-white/[0.1]"
      }`}
    >
      <MoreHorizontal size={18} />
    </button>
  );

  const count = `${playlist.itemCount} ${playlist.itemCount === 1 ? "video" : "videos"}`;
  const titleSize =
    shownTitle.length > 28 ? "text-5xl" : shownTitle.length > 14 ? "text-6xl min-[1400px]:text-7xl" : "text-7xl min-[1400px]:text-8xl";

  return (
    <div className="relative isolate shrink-0 overflow-hidden">
      <CoverPlate ref={coverRef} cover={cover ?? undefined} dragging={rowDragging} armed={coverArmed} dragTitle={dragTitle} upNext={upNext} onPlay={onPlayCover} />

      <div className="pointer-events-none relative z-10 flex min-h-[340px] flex-col justify-between px-4 pb-12 pt-4 min-[900px]:min-h-[360px] min-[900px]:px-8 min-[900px]:pt-5 min-[1400px]:min-h-[400px]">
        <button
          onClick={onBack}
          className="pointer-events-auto group -ml-1 flex items-center gap-1 self-start rounded-full py-1 pl-1 pr-3 text-stone-300 transition-colors hover:text-white"
        >
          <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
          <span className="text-[13px] font-semibold">Library</span>
        </button>

        <div className="pointer-events-auto min-w-0 max-w-full min-[900px]:max-w-[58%]">
          <div className="flex items-start">
            {renaming ? (
              <input
                ref={inputRef}
                defaultValue={shownTitle}
                aria-label="Playlist name"
                maxLength={120}
                onBlur={() => finishRename(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishRename(true);
                  else if (e.key === "Escape") {
                    e.stopPropagation();
                    finishRename(false);
                  }
                }}
                className={`m-0 block min-w-[3ch] max-w-full appearance-none [field-sizing:content] box-border h-[calc(0.95em+4px)] rounded-none border-0 bg-transparent p-0 pb-1 caret-[color:var(--accent)] shadow-[inset_0_-3px_0_0_var(--accent)] ${titleSize} font-black leading-[0.95] tracking-[-0.045em] text-white outline-none selection:bg-[color:var(--accent)]/30`}
              />
            ) : (
              <h1
                className={`min-w-0 flex-1 cursor-text line-clamp-2 break-words pb-1 ${titleSize} font-black leading-[0.95] tracking-[-0.045em] text-white`}
                onClick={demo ? undefined : () => setRenaming(true)}
              >
                {shownTitle}
              </h1>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm font-semibold text-stone-200">
            <PlaylistAvatarStack items={playlist.items} />
            <span>{count}</span>
            <span aria-hidden className="h-3.5 w-px bg-white/25" />
            <span>{formatHoursMinutes(playlist.combinedDuration)}</span>
            {demo ? (
              <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-200">
                Demo
              </span>
            ) : null}
          </div>
          <SeasonButtons
            sessionId={sessionId}
            started={started}
            disabled={empty || demo === true}
            trailing={demo ? null : optionsButton}
          />
        </div>
      </div>

      <MusicFloatingMenu
        open={menuAt != null}
        x={menuAt?.x ?? 0}
        y={menuAt?.y ?? 0}
        placement={menuAt?.placement}
        theme="library"
        onClose={close}
        ariaLabel="Playlist options"
      >
        <MusicMenuSection label="Playlist" tone={MUSIC_MENU_TONES.playlist}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playlist}
            label="Rename"
            icon={<Pencil size={icon} strokeWidth={2.25} />}
            onClick={act(() => setRenaming(true))}
          />
        </MusicMenuSection>
        <MusicMenuSection label="Watched" tone={MUSIC_MENU_TONES.playback}>
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label="Mark all watched"
            icon={<Eye size={icon} strokeWidth={2.25} />}
            onClick={act(() => onMarkAll(true))}
          />
          <MusicMenuRow
            tone={MUSIC_MENU_TONES.playback}
            label="Mark all unwatched"
            icon={<EyeOff size={icon} strokeWidth={2.25} />}
            onClick={act(() => onMarkAll(false))}
          />
          {isVideoPlaylist ? (
            <MusicMenuRow
              tone={MUSIC_MENU_TONES.playback}
              label="Remove watched"
              variant="danger"
              icon={<Trash2 size={icon} strokeWidth={2.25} />}
              onClick={act(onRemoveWatched)}
            />
          ) : null}
        </MusicMenuSection>
      </MusicFloatingMenu>
    </div>
  );
});

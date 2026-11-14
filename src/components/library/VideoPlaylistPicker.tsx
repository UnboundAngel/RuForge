import { useEffect, useMemo, useState } from "react";
import { Check, Clock, ListVideo, Minus, Plus, Search } from "lucide-react";
import { HoverMarqueeText } from "@/components/music/HoverMarqueeText";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicMenuRow,
  MusicMenuSection,
} from "@/components/music/musicMenuUi";
import { localThumbSrc } from "@/lib/localImageSrc";
import { mediaPathsMatch } from "@/lib/mediaPathMatch";
import { videoItemKey } from "@/lib/playlistSession/itemKey";
import { nextVideoPlaylistTitle, scanPlaylistDuplicates } from "@/lib/playlistRecordOps";
import { cn } from "@/lib/utils";
import { useRuforgeStore } from "@/store/ruforgeStore";
import { membershipIn, useDiskPlaylistTargets, type Membership } from "./useDiskPlaylistTargets";
import {
  WATCH_LATER_ID,
  sortVirtualRecords,
  virtualPlaylistPath,
  type VirtualPlaylistRecord,
} from "@/virtualPlaylists";

const tone = MUSIC_MENU_TONES.playlist;
const ACCENT = "var(--rf-menu-accent,var(--accent))";


/**
 * Picker for saving videos to a video playlist: search, New playlist, then a checkbox per playlist.
 * Toggling saves or removes at once and stays open, so one video can land in several playlists.
 * Shared by the card menu flyout and the anchored popover.
 */
export function VideoPlaylistPicker({
  paths,
  onClose,
  autoFocus = true,
  onLayoutChange,
}: {
  paths: string[];
  onClose: () => void;
  autoFocus?: boolean;
  /** Fires when rows appear or go, so a floating host can re-measure. */
  onLayoutChange?: (key: string) => void;
}) {
  const notify = useRuforgeStore((s) => s.notify);
  const entries = useRuforgeStore((s) => s.entries);
  const addToVirtualPlaylist = useRuforgeStore((s) => s.addToVirtualPlaylist);
  const removePathsFromVirtualPlaylist = useRuforgeStore((s) => s.removePathsFromVirtualPlaylist);
  const createVirtualPlaylist = useRuforgeStore((s) => s.createVirtualPlaylist);
  const listVirtualPlaylistRecords = useRuforgeStore((s) => s.listVirtualPlaylistRecords);
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState<string | null>(null);
  const [warn, setWarn] = useState<{ record: VirtualPlaylistRecord; missing: string[]; dupes: string[] } | null>(null);
  // Records are read from storage, so a toggle bumps this to re-read them.
  const [rev, setRev] = useState(0);

  const records = useMemo(
    () => sortVirtualRecords(listVirtualPlaylistRecords()).filter((r) => r.kind !== "music"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listVirtualPlaylistRecords, entries, rev],
  );

  const covers = useMemo(() => {
    const byPath = new Map<string, string>();
    for (const e of entries) {
      if (e.kind !== "playlist") continue;
      const first = e.items[0];
      const cover = e.stackThumbnailPath || first?.thumbnailPath || first?.ruforgePosterPath;
      if (cover) byPath.set(e.path, cover);
    }
    return byPath;
  }, [entries]);

  const disk = useDiskPlaylistTargets(paths);
  const q = query.trim().toLowerCase();
  const matches = (title: string) => !q || title.toLowerCase().includes(q);
  const visible = records.filter((r) => matches(r.title));
  const visibleDisk = disk.targets.filter((t) => matches(t.title));
  const canToggle = paths.length > 0;
  const layoutKey = `${visible.length + visibleDisk.length}:${naming != null}:${warn != null}`;
  useEffect(() => onLayoutChange?.(layoutKey), [layoutKey, onLayoutChange]);

  const close = () => {
    setQuery("");
    setNaming(null);
    setWarn(null);
    onClose();
  };

  const addPaths = (record: VirtualPlaylistRecord, list: string[]) => {
    if (list.length === 0) return;
    addToVirtualPlaylist(record.id, list);
    notify(`Added to ${record.title}`);
    setRev((n) => n + 1);
  };

  const videoKeyOf = (path: string): string | null => {
    for (const e of entries) {
      const file = e.kind === "media" ? (mediaPathsMatch(e.path, path) ? e : null) : e.items.find((f) => mediaPathsMatch(f.path, path));
      if (file) return videoItemKey(file);
    }
    return null;
  };

  const toggle = (record: VirtualPlaylistRecord, membership: Membership) => {
    setWarn(null);
    if (membership === "all") {
      removePathsFromVirtualPlaylist(record.id, paths);
      notify(`Removed from ${record.title}`);
      setRev((n) => n + 1);
      return;
    }
    const scan = scanPlaylistDuplicates(record, paths, videoKeyOf);
    const missing = paths.filter((p) => !scan.samePath.includes(p));
    if (scan.sameVideo.length > 0) {
      setWarn({ record, missing, dupes: scan.sameVideo });
      return;
    }
    addPaths(record, missing);
  };

  const create = (name: string) => {
    const title = name.trim() || nextVideoPlaylistTitle(records);
    createVirtualPlaylist(title, paths);
    notify(`Created "${title}"`);
    close();
  };

  return (
    <>
      {canToggle ? (
        <label className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.06] px-2 text-[12px] text-white/60 focus-within:bg-white/[0.09]">
          <Search size={MUSIC_MENU_ICON_SIZE} className="shrink-0" aria-hidden />
          <input
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a playlist"
            className="min-w-0 flex-1 border-0 bg-transparent text-white outline-none placeholder:text-white/35"
            aria-label="Find a playlist"
          />
        </label>
      ) : null}

      {warn ? (
        <div className="flex flex-col gap-2 rounded-lg bg-white/[0.06] p-2.5">
          <p className="text-[12px] leading-snug text-stone-200">
            {warn.dupes.length === 1 ? "This video is" : `${warn.dupes.length} of these videos are`} already in{" "}
            {warn.record.title} as another copy.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-stone-200 transition-colors hover:bg-white/[0.14]"
              onClick={() => {
                addPaths(warn.record, warn.missing.filter((p) => !warn.dupes.includes(p)));
                setWarn(null);
              }}
            >
              Skip
            </button>
            <button
              type="button"
              className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--rf-on-accent)] transition-[filter] hover:brightness-110"
              onClick={() => {
                addPaths(warn.record, warn.missing);
                setWarn(null);
              }}
            >
              Add anyway
            </button>
          </div>
        </div>
      ) : null}

      <MusicMenuSection label="Playlists" tone={tone}>
        {naming != null ? (
          <form
            className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.06] px-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              create(naming);
            }}
          >
            <Plus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} className="shrink-0" style={{ color: ACCENT }} aria-hidden />
            <input
              autoFocus
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => {
                if (!naming.trim()) setNaming(null);
              }}
              placeholder="Playlist name"
              aria-label="New playlist name"
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-white outline-none placeholder:text-white/35"
            />
          </form>
        ) : (
          <MusicMenuRow
            tone={tone}
            label="New playlist"
            icon={<Plus size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
            onClick={() => setNaming(nextVideoPlaylistTitle(records))}
          />
        )}
        {canToggle
          ? visible.map((record) => {
              const membership = membershipIn(record.items, paths);
              return (
                <PlaylistRow
                  key={record.id}
                  title={record.title}
                  watchLater={record.id === WATCH_LATER_ID}
                  cover={covers.get(virtualPlaylistPath(record.id))}
                  membership={membership}
                  onToggle={() => toggle(record, membership)}
                />
              );
            })
          : null}
        {canToggle
          ? visibleDisk.map((target) => {
              const membership = membershipIn(target.items, paths);
              return (
                <PlaylistRow
                  key={target.path}
                  title={target.title}
                  cover={covers.get(target.path)}
                  membership={membership}
                  onToggle={() => disk.toggle(target, membership)}
                />
              );
            })
          : null}
        {canToggle && records.length + disk.targets.length > 0 && visible.length + visibleDisk.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-white/40">No playlist matches</p>
        ) : null}
      </MusicMenuSection>
    </>
  );
}

function PlaylistRow({
  title,
  watchLater = false,
  cover,
  membership,
  onToggle,
}: {
  title: string;
  watchLater?: boolean;
  cover: string | undefined;
  membership: Membership;
  onToggle: () => void;
}) {
  const checked = membership !== "none";
  const Fallback = watchLater ? Clock : ListVideo;

  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={membership === "all" ? true : membership === "some" ? "mixed" : false}
      onClick={onToggle}
      className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 px-1.5 text-left text-[12px] text-[#cfcfcf] outline-none transition-colors duration-100 hover:bg-white/[0.07] hover:text-white"
    >
      <span className="flex h-6 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-[color:var(--rf-field)]">
        {cover ? (
          <img src={localThumbSrc(cover)} alt="" className="h-full w-full object-cover" />
        ) : (
          <Fallback size={12} strokeWidth={1.75} className="text-stone-500" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <HoverMarqueeText text={title} slow />
      </span>
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-transparent" : "border-white/30",
        )}
        style={checked ? { background: ACCENT } : undefined}
        aria-hidden
      >
        {membership === "all" && <Check size={10} strokeWidth={3} className="text-stone-900" />}
        {membership === "some" && <Minus size={10} strokeWidth={3} className="text-stone-900" />}
      </span>
    </button>
  );
}
